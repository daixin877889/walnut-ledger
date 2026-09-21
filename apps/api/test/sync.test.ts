import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Miniflare } from 'miniflare'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { signAccessToken } from '../src/auth/tokens'
import type { Env } from '../src/env'

const migrationPath = fileURLToPath(new URL('../migrations/0001_core.sql', import.meta.url))
const compactSql = (sql: string) => sql.replace(/\s+/g, ' ').replace(/;\s*/g, ';\n').trim()
const ledgerId = '11111111-1111-4111-8111-111111111111'

describe('incremental sync', () => {
  let mf: Miniflare; let db: D1Database; let env: Env; let token: string
  beforeEach(async () => {
    mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("ok") } }', d1Databases: ['DB'], r2Buckets: ['FILES'] })
    db = await mf.getD1Database('DB'); await db.exec(compactSql(await readFile(migrationPath, 'utf8')))
    env = { DB: db, FILES: (await mf.getR2Bucket('FILES')) as unknown as R2Bucket, ACCESS_TOKEN_SECRET: 'test-secret-that-is-at-least-32-bytes', PASSWORD_ITERATIONS: '1000' }
    await db.prepare('INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind('user-1', 'owner', 'x', 'now', 'now').run()
    await db.prepare('INSERT INTO devices (id, user_id, name, refresh_token_hash, refresh_expires_at, last_seen_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind('device-1', 'user-1', 'phone', 'x', '2099', 'now', 'now').run()
    await db.prepare('INSERT INTO ledgers (id, owner_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(ledgerId, 'user-1', '账本', 'now', 'now').run()
    await db.prepare('INSERT INTO ledger_members (ledger_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').bind(ledgerId, 'user-1', 'owner', 'now').run()
    token = await signAccessToken('user-1', 'device-1', env.ACCESS_TOKEN_SECRET)
  })
  afterEach(async () => mf.dispose())
  const call = (path: string, method = 'GET', body?: unknown) => createApp().request(`/api/v1${path}`, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }, env)

  it('accepts an idempotent push and exposes it through paged pull', async () => {
    const operation = { operation_id: 'op-1', entity_type: 'transaction', entity_id: 'tx-1', operation: 'upsert', base_version: 0, payload: { kind: 'expense', amount_cents: 2850, note: '午餐', occurred_at: '2026-09-21T08:00:00Z' } }
    const first = await call('/sync/push', 'POST', { ledger_id: ledgerId, changes: [operation] })
    expect(first.status).toBe(200)
    expect(((await first.json()) as any).data.accepted).toHaveLength(1)
    expect(await db.prepare('SELECT amount_cents FROM transactions WHERE id = ?').bind('tx-1').first('amount_cents')).toBe(2850)
    const replay = (await (await call('/sync/push', 'POST', { ledger_id: ledgerId, changes: [operation] })).json()) as any
    expect(replay.data.accepted[0].revision).toBe(1)
    const pull = (await (await call(`/sync/pull?ledger_id=${ledgerId}&after=0&limit=1`)).json()) as any
    expect(pull.data.changes).toHaveLength(1)
    expect(pull.data.revision).toBe(1)
  })

  it('returns client and server versions for a stale update', async () => {
    const base = { operation_id: 'op-1', entity_type: 'transaction', entity_id: 'tx-1', operation: 'upsert', base_version: 0, payload: { kind: 'expense', amount_cents: 100, occurred_at: '2026-09-21T08:00:00Z', note: 'A' } }
    await call('/sync/push', 'POST', { ledger_id: ledgerId, changes: [base] })
    const stale = (await (await call('/sync/push', 'POST', { ledger_id: ledgerId, changes: [{ ...base, operation_id: 'op-2', base_version: 0, payload: { ...base.payload, note: 'B' } }] })).json()) as any
    expect(stale.data.conflicts[0]).toMatchObject({ entity_id: 'tx-1', client: { version: 1 }, server: { version: 1 } })
  })
})
