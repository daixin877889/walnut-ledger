import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Miniflare } from 'miniflare'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import type { Env } from '../src/env'
import { sha256Hex, signAccessToken } from '../src/auth/tokens'

const migrationPath = fileURLToPath(new URL('../migrations/0001_core.sql', import.meta.url))
const compactSql = (sql: string) => sql.replace(/\s+/g, ' ').replace(/;\s*/g, ';\n').trim()

describe('transactions API', () => {
  let mf: Miniflare
  let db: D1Database
  let env: Env
  let token: string

  beforeEach(async () => {
    mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("ok") } }', d1Databases: ['DB'], r2Buckets: ['FILES'] })
    db = await mf.getD1Database('DB')
    await db.exec(compactSql(await readFile(migrationPath, 'utf8')))
    env = { DB: db, FILES: (await mf.getR2Bucket('FILES')) as unknown as R2Bucket, ACCESS_TOKEN_SECRET: 'test-secret-that-is-at-least-32-bytes', PASSWORD_ITERATIONS: '1000' }
    await db.prepare('INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind('user-1', 'owner', 'unused', '2026-09-21T00:00:00Z', '2026-09-21T00:00:00Z').run()
    await db.prepare('INSERT INTO devices (id, user_id, name, refresh_token_hash, refresh_expires_at, last_seen_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind('device-1', 'user-1', 'phone', await sha256Hex('refresh'), '2099-01-01T00:00:00Z', '2026-09-21T00:00:00Z', '2026-09-21T00:00:00Z').run()
    await db.prepare('INSERT INTO ledgers (id, owner_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind('11111111-1111-4111-8111-111111111111', 'user-1', '账本', '2026-09-21T00:00:00Z', '2026-09-21T00:00:00Z').run()
    await db.prepare('INSERT INTO ledger_members (ledger_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').bind('11111111-1111-4111-8111-111111111111', 'user-1', 'owner', '2026-09-21T00:00:00Z').run()
    for (const id of ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333']) await db.prepare('INSERT INTO accounts (id, ledger_id, name, type, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(id, '11111111-1111-4111-8111-111111111111', id, 'cash', 'user-1', 'user-1', '2026-09-21T00:00:00Z', '2026-09-21T00:00:00Z').run()
    await db.prepare('INSERT INTO categories (id, ledger_id, kind, name, icon, color, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111', 'expense', '餐饮', '44444444-4444-4444-8444-444444444444', '#f00', 'user-1', 'user-1', '2026-09-21T00:00:00Z', '2026-09-21T00:00:00Z').run()
    token = await signAccessToken('user-1', 'device-1', env.ACCESS_TOKEN_SECRET)
  })

  afterEach(async () => mf.dispose())

  async function post(path: string, body: unknown) {
    return createApp().request(`/api/v1${path}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }, env)
  }

  async function request(path: string, method = 'GET', body?: unknown) {
    return createApp().request(`/api/v1${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }, env)
  }

  const expense = { ledger_id: '11111111-1111-4111-8111-111111111111', idempotency_key: 'device-1:42', amount_cents: 1200, account_id: '22222222-2222-4222-8222-222222222222', category_id: '44444444-4444-4444-8444-444444444444', occurred_at: '2026-09-21T08:00:00Z', note: '午餐' }

  it('returns the original transaction for an idempotent replay', async () => {
    const first = (await (await post('/transactions', expense)).json()) as { data: { id: string } }
    const second = (await (await post('/transactions', expense)).json()) as { data: { id: string } }
    expect(second.data.id).toBe(first.data.id)
    expect(await db.prepare('SELECT COUNT(*) AS total FROM transactions').first('total')).toBe(1)
  })

  it.each([0, -1, Number.MAX_SAFE_INTEGER + 1])('rejects invalid amount %s', async (amount) => {
    expect((await post('/transactions', { ...expense, idempotency_key: `bad:${amount}`, amount_cents: amount })).status).toBe(422)
  })

  it('rejects an account outside the ledger', async () => {
    expect((await post('/transactions', { ...expense, account_id: 'missing' })).status).toBe(404)
  })

  it('creates a balanced transfer atomically', async () => {
    const response = await post('/transfers', { ledger_id: '11111111-1111-4111-8111-111111111111', idempotency_key: 'transfer:1', amount_cents: 5000, from_account_id: '22222222-2222-4222-8222-222222222222', to_account_id: '33333333-3333-4333-8333-333333333333', occurred_at: '2026-09-21T09:00:00Z' })
    expect(response.status).toBe(201)
    expect(await db.prepare('SELECT SUM(amount_cents) AS total FROM account_entries').first('total')).toBe(0)
    expect(await db.prepare('SELECT COUNT(*) AS total FROM account_entries').first('total')).toBe(2)
  })

  it('leaves no transfer rows when an account is invalid', async () => {
    const response = await post('/transfers', { ledger_id: '11111111-1111-4111-8111-111111111111', idempotency_key: 'transfer:bad', amount_cents: 5000, from_account_id: '22222222-2222-4222-8222-222222222222', to_account_id: 'missing', occurred_at: '2026-09-21T09:00:00Z' })
    expect(response.status).toBe(404)
    expect(await db.prepare("SELECT COUNT(*) AS total FROM transactions WHERE kind = 'transfer'").first('total')).toBe(0)
    expect(await db.prepare('SELECT COUNT(*) AS total FROM account_entries').first('total')).toBe(0)
  })

  it.each([
    ['accounts', { name: '银行卡', type: 'bank', initial_balance_cents: 1000 }],
    ['categories', { name: '交通', kind: 'expense', icon: 'bus', color: '#123456' }],
    ['tags', { name: '报销', color: '#654321' }],
  ])('creates, lists and archives %s', async (resource, payload) => {
    const created = await request(`/ledgers/${expense.ledger_id}/${resource}`, 'POST', payload)
    expect(created.status).toBe(201)
    const id = ((await created.json()) as { data: { id: string } }).data.id
    const listed = (await (await request(`/ledgers/${expense.ledger_id}/${resource}`)).json()) as { data: Array<{ id: string }> }
    expect(listed.data.some((item) => item.id === id)).toBe(true)
    expect((await request(`/ledgers/${expense.ledger_id}/${resource}/${id}`, 'DELETE')).status).toBe(204)
    expect(await db.prepare(`SELECT deleted_at FROM ${resource} WHERE id = ?`).bind(id).first('deleted_at')).toBeTypeOf('string')
  })

  it('updates a transaction, increments its version, and soft deletes it', async () => {
    const created = (await (await post('/transactions', expense)).json()) as { data: { id: string } }
    const updated = await request(`/transactions/${created.data.id}`, 'PATCH', { ledger_id: expense.ledger_id, version: 1, note: '晚餐', amount_cents: 1300, occurred_at: '2026-09-21T10:00:00Z' })
    expect(updated.status).toBe(200)
    expect(((await updated.json()) as { data: { version: number; note: string } }).data).toMatchObject({ version: 2, note: '晚餐' })
    expect(await db.prepare('SELECT amount_cents FROM account_entries WHERE transaction_id = ?').bind(created.data.id).first('amount_cents')).toBe(-1300)
    expect((await request(`/transactions/${created.data.id}?ledger_id=${expense.ledger_id}&version=2`, 'DELETE')).status).toBe(204)
    expect(await db.prepare('SELECT deleted_at FROM transactions WHERE id = ?').bind(created.data.id).first('deleted_at')).toBeTypeOf('string')
    expect(await db.prepare('SELECT COUNT(*) AS total FROM account_entries WHERE transaction_id = ?').bind(created.data.id).first('total')).toBe(0)
  })

  it('paginates transactions by occurred_at and id descending', async () => {
    for (const [key, at] of [['one', '2026-09-20T08:00:00Z'], ['two', '2026-09-21T08:00:00Z'], ['three', '2026-09-22T08:00:00Z']]) {
      expect((await post('/transactions', { ...expense, idempotency_key: key, occurred_at: at })).status).toBe(201)
    }
    const first = (await (await request(`/ledgers/${expense.ledger_id}/transactions?limit=2`)).json()) as { data: { items: Array<{ occurred_at: string }>; next_cursor: string | null } }
    expect(first.data.items.map((item) => item.occurred_at)).toEqual(['2026-09-22T08:00:00Z', '2026-09-21T08:00:00Z'])
    expect(first.data.next_cursor).toBeTypeOf('string')
    const second = (await (await request(`/ledgers/${expense.ledger_id}/transactions?limit=2&cursor=${encodeURIComponent(first.data.next_cursor!)}`)).json()) as { data: { items: Array<{ occurred_at: string }> } }
    expect(second.data.items.map((item) => item.occurred_at)).toEqual(['2026-09-20T08:00:00Z'])
  })
})
