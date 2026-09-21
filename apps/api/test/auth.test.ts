import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Miniflare } from 'miniflare'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import type { Env } from '../src/env'

const migrationPath = fileURLToPath(new URL('../migrations/0001_core.sql', import.meta.url))

function toD1ExecInput(sql: string): string {
  return sql.replace(/\s+/g, ' ').replace(/;\s*/g, ';\n').trim()
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

describe('authentication API', () => {
  let miniflare: Miniflare
  let database: D1Database
  let env: Env

  beforeEach(async () => {
    miniflare = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
      d1Databases: ['DB'],
      r2Buckets: ['FILES'],
    })
    database = await miniflare.getD1Database('DB')
    const migration = await readFile(migrationPath, 'utf8')
    await database.exec(toD1ExecInput(migration))
    env = {
      DB: database,
      FILES: (await miniflare.getR2Bucket('FILES')) as unknown as R2Bucket,
      ACCESS_TOKEN_SECRET: 'test-secret-that-is-at-least-32-bytes',
      PASSWORD_ITERATIONS: '1000',
    }
  })

  afterEach(async () => {
    await miniflare.dispose()
  })

  async function seedInvite(code: string, expiresAt: string, maxUses = 1) {
    await database
      .prepare(
        'INSERT INTO invite_codes (id, code_hash, max_uses, used_count, expires_at, created_at) VALUES (?, ?, ?, 0, ?, ?)',
      )
      .bind(crypto.randomUUID(), await sha256Hex(code), maxUses, expiresAt, '2026-09-21T00:00:00.000Z')
      .run()
  }

  async function post(path: string, body: unknown, token?: string) {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (token) headers.authorization = `Bearer ${token}`
    return createApp().request(
      `/api/v1/auth${path}`,
      { method: 'POST', headers, body: JSON.stringify(body) },
      env,
    )
  }

  async function register(username = 'dai') {
    await seedInvite('ACTIVE-CODE', '2099-01-01T00:00:00.000Z')
    return post('/register', {
      invite_code: 'ACTIVE-CODE',
      username,
      password: 'correct-horse-battery',
      device_name: 'Test Phone',
    })
  }

  async function authorized(path: string, accessToken: string, method = 'GET') {
    return createApp().request(
      `/api/v1/auth${path}`,
      { method, headers: { authorization: `Bearer ${accessToken}` } },
      env,
    )
  }

  it('rejects an expired invite without creating a user', async () => {
    await seedInvite('OLD-CODE', '2020-01-01T00:00:00.000Z')

    const response = await post('/register', {
      invite_code: 'OLD-CODE',
      username: 'dai',
      password: 'correct-horse-battery',
      device_name: 'Test Phone',
    })

    expect(response.status).toBe(422)
    const count = await database.prepare('SELECT COUNT(*) AS total FROM users').first<{ total: number }>()
    expect(count?.total).toBe(0)
  })

  it('registers a user, device and personal ledger atomically', async () => {
    const response = await register()
    const body = (await response.json()) as { data: { access_token: string; refresh_token: string } }

    expect(response.status).toBe(201)
    expect(body.data.access_token).toBeTruthy()
    expect(body.data.refresh_token).toBeTruthy()
    expect(await database.prepare('SELECT COUNT(*) AS total FROM users').first('total')).toBe(1)
    expect(await database.prepare('SELECT COUNT(*) AS total FROM devices').first('total')).toBe(1)
    expect(await database.prepare('SELECT COUNT(*) AS total FROM ledgers').first('total')).toBe(1)
  })

  it('supports the production password cost configured for the free Worker', async () => {
    env.ENVIRONMENT = 'production'
    env.PASSWORD_ITERATIONS = '10000'

    const response = await register('free_worker_user')

    expect(response.status).toBe(201)
  })

  it('rejects a duplicate username', async () => {
    expect((await register()).status).toBe(201)
    await seedInvite('SECOND-CODE', '2099-01-01T00:00:00.000Z')

    const response = await post('/register', {
      invite_code: 'SECOND-CODE',
      username: 'DAI',
      password: 'another-correct-password',
      device_name: 'Second Phone',
    })

    expect(response.status).toBe(409)
  })

  it('rejects an incorrect password', async () => {
    expect((await register()).status).toBe(201)
    const response = await post('/login', {
      username: 'dai',
      password: 'wrong-password',
      device_name: 'Other Phone',
    })
    expect(response.status).toBe(401)
  })

  it('rotates refresh tokens and rejects replay', async () => {
    const registered = (await (await register()).json()) as { data: { refresh_token: string } }
    const refreshed = await post('/refresh', { refresh_token: registered.data.refresh_token })
    const refreshedBody = (await refreshed.json()) as { data: { refresh_token: string } }

    expect(refreshed.status).toBe(200)
    expect(refreshedBody.data.refresh_token).not.toBe(registered.data.refresh_token)
    expect((await post('/refresh', { refresh_token: registered.data.refresh_token })).status).toBe(401)
  })

  it('revokes the current device session', async () => {
    const registered = (await (await register()).json()) as {
      data: { access_token: string; refresh_token: string; device: { id: string } }
    }
    const response = await post(`/devices/${registered.data.device.id}/revoke`, {}, registered.data.access_token)

    expect(response.status).toBe(204)
    expect((await post('/refresh', { refresh_token: registered.data.refresh_token })).status).toBe(401)
  })

  it('lists only the signed-in user devices', async () => {
    const registered = (await (await register()).json()) as { data: { access_token: string } }
    const response = await authorized('/devices', registered.data.access_token)
    const body = (await response.json()) as { data: Array<{ name: string }> }

    expect(response.status).toBe(200)
    expect(body.data).toEqual([{ id: expect.any(String), name: 'Test Phone', last_seen_at: expect.any(String), current: true }])
  })

  it('logs out the current device', async () => {
    const registered = (await (await register()).json()) as {
      data: { access_token: string; refresh_token: string }
    }
    const response = await authorized('/logout', registered.data.access_token, 'POST')

    expect(response.status).toBe(204)
    expect((await post('/refresh', { refresh_token: registered.data.refresh_token })).status).toBe(401)
  })
})
