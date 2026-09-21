import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Miniflare } from 'miniflare'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import type { Env } from '../src/env'
import { can } from '../src/ledgers/policy'
import { sha256Hex, signAccessToken } from '../src/auth/tokens'

const migrationPath = fileURLToPath(new URL('../migrations/0001_core.sql', import.meta.url))

function toD1ExecInput(sql: string): string {
  return sql.replace(/\s+/g, ' ').replace(/;\s*/g, ';\n').trim()
}

describe('ledger role policy', () => {
  it.each([
    ['owner', 'manage_members', true],
    ['editor', 'write_transaction', true],
    ['editor', 'manage_members', false],
    ['viewer', 'write_transaction', false],
    ['viewer', 'read', true],
  ] as const)('%s / %s => %s', (role, permission, allowed) => {
    expect(can(role, permission)).toBe(allowed)
  })
})

describe('shared ledger API', () => {
  let miniflare: Miniflare
  let database: D1Database
  let env: Env
  const users = {
    owner: { id: 'user-owner', device: 'device-owner' },
    editor: { id: 'user-editor', device: 'device-editor' },
    outsider: { id: 'user-outsider', device: 'device-outsider' },
  }

  beforeEach(async () => {
    miniflare = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("ok") } }', d1Databases: ['DB'], r2Buckets: ['FILES'] })
    database = await miniflare.getD1Database('DB')
    await database.exec(toD1ExecInput(await readFile(migrationPath, 'utf8')))
    env = {
      DB: database,
      FILES: (await miniflare.getR2Bucket('FILES')) as unknown as R2Bucket,
      ACCESS_TOKEN_SECRET: 'test-secret-that-is-at-least-32-bytes',
      PASSWORD_ITERATIONS: '1000',
    }
    for (const [name, user] of Object.entries(users)) {
      await database.prepare('INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .bind(user.id, name, 'unused', '2026-09-21T00:00:00Z', '2026-09-21T00:00:00Z').run()
      await database.prepare('INSERT INTO devices (id, user_id, name, refresh_token_hash, refresh_expires_at, last_seen_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(user.device, user.id, `${name} phone`, await sha256Hex(`${name}-refresh`), '2099-01-01T00:00:00Z', '2026-09-21T00:00:00Z', '2026-09-21T00:00:00Z').run()
    }
    await database.prepare('INSERT INTO ledgers (id, owner_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .bind('ledger-a', users.owner.id, '家庭账本', '2026-09-21T00:00:00Z', '2026-09-21T00:00:00Z').run()
    await database.prepare('INSERT INTO ledger_members (ledger_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)')
      .bind('ledger-a', users.owner.id, 'owner', '2026-09-21T00:00:00Z').run()
    await database.prepare('INSERT INTO ledger_members (ledger_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)')
      .bind('ledger-a', users.editor.id, 'editor', '2026-09-21T00:00:00Z').run()
  })

  afterEach(async () => miniflare.dispose())

  async function requestAs(
    actor: keyof typeof users,
    path: string,
    method = 'GET',
    body?: unknown,
  ) {
    const user = users[actor]
    const token = await signAccessToken(user.id, user.device, env.ACCESS_TOKEN_SECRET)
    const init: RequestInit = {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    }
    if (body !== undefined) init.body = JSON.stringify(body)
    return createApp().request(`/api/v1${path}`, init, env)
  }

  it('returns 404 without leaking a ledger to a non-member', async () => {
    expect((await requestAs('owner', '/ledgers/ledger-a')).status).toBe(200)
    const response = await requestAs('outsider', '/ledgers/ledger-a')
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ code: 'LEDGER_NOT_FOUND', data: null })
  })

  it('lets an owner create an invite and an outsider preview then join', async () => {
    const created = await requestAs('owner', '/ledgers/ledger-a/invites', 'POST', {
      default_role: 'viewer', max_uses: 2, expires_at: '2099-01-01T00:00:00Z',
    })
    const createdBody = (await created.json()) as { data: { code: string } }
    expect(created.status).toBe(201)

    const preview = await requestAs('outsider', `/ledger-invites/${createdBody.data.code}/preview`)
    expect(await preview.json()).toMatchObject({ data: { ledger_name: '家庭账本', default_role: 'viewer' } })
    const joined = await requestAs('outsider', `/ledger-invites/${createdBody.data.code}/join`, 'POST')
    expect(joined.status).toBe(200)
    expect(await database.prepare('SELECT role FROM ledger_members WHERE ledger_id = ? AND user_id = ?').bind('ledger-a', users.outsider.id).first('role')).toBe('viewer')
  })

  it('prevents an editor from managing members', async () => {
    const response = await requestAs('editor', '/ledgers/ledger-a/invites', 'POST', {
      default_role: 'viewer', max_uses: 1, expires_at: '2099-01-01T00:00:00Z',
    })
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ code: 'LEDGER_NOT_FOUND', data: null })
  })

  it('changes role, removes a member and records audit logs', async () => {
    const changed = await requestAs('owner', `/ledgers/ledger-a/members/${users.editor.id}`, 'PATCH', { role: 'viewer' })
    expect(changed.status).toBe(200)
    const removed = await requestAs('owner', `/ledgers/ledger-a/members/${users.editor.id}`, 'DELETE')
    expect(removed.status).toBe(204)
    expect(await database.prepare('SELECT COUNT(*) AS total FROM operation_logs WHERE ledger_id = ?').bind('ledger-a').first('total')).toBe(2)
  })

  it('transfers ownership atomically', async () => {
    const response = await requestAs('owner', '/ledgers/ledger-a/transfer-ownership', 'POST', {
      user_id: users.editor.id,
    })
    expect(response.status).toBe(200)
    expect(await database.prepare('SELECT owner_id FROM ledgers WHERE id = ?').bind('ledger-a').first('owner_id')).toBe(users.editor.id)
    expect(await database.prepare('SELECT role FROM ledger_members WHERE ledger_id = ? AND user_id = ?').bind('ledger-a', users.owner.id).first('role')).toBe('editor')
    expect(await database.prepare('SELECT role FROM ledger_members WHERE ledger_id = ? AND user_id = ?').bind('ledger-a', users.editor.id).first('role')).toBe('owner')
  })

  it('does not write an audit log when the target member does not exist', async () => {
    const response = await requestAs('owner', '/ledgers/ledger-a/members/missing-user', 'PATCH', { role: 'viewer' })
    expect(response.status).toBe(404)
    expect(await database.prepare('SELECT COUNT(*) AS total FROM operation_logs WHERE ledger_id = ?').bind('ledger-a').first('total')).toBe(0)
  })

  it('creates and lists only ledgers belonging to the user', async () => {
    const created = await requestAs('outsider', '/ledgers', 'POST', { name: '旅行账本' })
    expect(created.status).toBe(201)
    const listed = await requestAs('outsider', '/ledgers')
    const body = (await listed.json()) as { data: Array<{ name: string }> }
    expect(body.data.map((ledger) => ledger.name)).toEqual(['旅行账本'])
  })

  it('lists active members for an owner', async () => {
    const response = await requestAs('owner', '/ledgers/ledger-a/members')
    const body = (await response.json()) as { data: Array<{ role: string }> }
    expect(response.status).toBe(200)
    expect(body.data.map((member) => member.role).sort()).toEqual(['editor', 'owner'])
  })
})
