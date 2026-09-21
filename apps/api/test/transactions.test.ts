import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Miniflare } from 'miniflare'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import type { Env } from '../src/env'
import { sha256Hex, signAccessToken } from '../src/auth/tokens'
import { SessionApiClient } from '../../mobile/src/core/api/client'
import { SessionStore } from '../../mobile/src/core/session/session-store'
import { MemorySecureStore } from '../../mobile/src/core/session/secure-store'

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

  it('renames and reorders a category, rejects stale edits, and preserves archived bill references', async () => {
    await post('/transactions', expense)
    const path = `/ledgers/${expense.ledger_id}/categories/${expense.category_id}`
    const updated = await request(path, 'PATCH', { name: '三餐', icon: '🍜', color: '#123456', sort_order: 5, version: 1 })
    expect(updated.status).toBe(200)
    expect((await updated.json() as any).data).toMatchObject({ name: '三餐', sort_order: 5, version: 2 })
    expect((await request(path, 'PATCH', { name: '旧编辑', icon: '🍜', color: '#123456', sort_order: 0, version: 1 })).status).toBe(409)
    await request(path, 'DELETE')
    const bills = await (await request(`/ledgers/${expense.ledger_id}/transactions`)).json() as any
    expect(bills.data.items[0]).toMatchObject({ category_id: expense.category_id, category_name: '三餐' })
  })

  it('rejects category edits from a viewer without changing the name', async () => {
    await db.prepare("UPDATE ledger_members SET role = 'viewer' WHERE user_id = 'user-1'").run()
    const response = await request(`/ledgers/${expense.ledger_id}/categories/${expense.category_id}`, 'PATCH', { name: '改名', icon: 'x', color: '#123456', sort_order: 0, version: 1 })
    expect(response.status).toBe(404)
    expect(await db.prepare('SELECT name FROM categories WHERE id = ?').bind(expense.category_id).first('name')).toBe('餐饮')
  })

  it('records income as a positive account entry and reports actual account balance', async () => {
    const created = await (await request(`/ledgers/${expense.ledger_id}/categories`, 'POST', { name: '工资', kind: 'income', icon: '💼', color: '#123456' })).json() as any
    expect((await post('/transactions', { ...expense, kind: 'income', category_id: created.data.id })).status).toBe(201)
    const accounts = await (await request(`/ledgers/${expense.ledger_id}/accounts`)).json() as any
    expect(accounts.data.find((item: any) => item.id === expense.account_id).balance_cents).toBe(1200)
  })
  it('adds default categories atomically without duplicating existing categories on retry', async () => {
    const path = `/ledgers/${expense.ledger_id}/categories/batch`
    const payload = [{ name: '餐饮', kind: 'expense', icon: '🍜', color: '#123456' }, { name: '工资', kind: 'income', icon: '💼', color: '#123456' }]
    expect((await post(path, payload)).status).toBe(201)
    expect((await post(path, payload)).status).toBe(201)
    expect(await db.prepare('SELECT COUNT(*) AS total FROM categories').first('total')).toBe(2)
  })
  it('persists monthly budgets with version checks and prevents viewer changes',async()=>{
    const path=`/ledgers/${expense.ledger_id}/budget`
    const initial=await request(path,'PUT',{month:'2026-09',amount_cents:620000,version:0})
    expect(initial.status).toBe(200)
    expect((await initial.json() as any).data).toMatchObject({amount_cents:620000,version:1})
    expect((await request(path,'PUT',{month:'2026-09',amount_cents:700000,version:0})).status).toBe(409)
    const read=await(await request(path+'?month=2026-09')).json() as any
    expect(read.data.amount_cents).toBe(620000)
    expect((await request(path+'?month=2026-13')).status).toBe(422)
    await db.prepare("UPDATE ledger_members SET role='viewer' WHERE user_id='user-1'").run()
    expect((await request(path,'PUT',{month:'2026-09',amount_cents:100,version:1})).status).toBe(404)
  })
  it('runs the mobile client through real API and D1 for expense, income, transfer and edit balances', async () => {
    const sessions = new SessionStore(new MemorySecureStore()); await sessions.setTokens(token, 'unused-refresh')
    const client = new SessionApiClient('https://local.test/api/v1', sessions, async (url, init) => createApp().request(String(url), init, env))
    const path = `/ledgers/${expense.ledger_id}`
    const incomeCategory = await client.request<{id:string}>(`${path}/categories`, {method:'POST',body:JSON.stringify({name:'工资',kind:'income',icon:'💼',color:'#123456'})})
    const spent = await client.request<{id:string}>('/transactions',{method:'POST',body:JSON.stringify(expense)})
    await client.request('/transactions',{method:'POST',body:JSON.stringify({...expense,kind:'income',category_id:incomeCategory.id,amount_cents:10000,idempotency_key:'mobile-income'})})
    await client.request('/transfers',{method:'POST',body:JSON.stringify({ledger_id:expense.ledger_id,from_account_id:expense.account_id,to_account_id:'33333333-3333-4333-8333-333333333333',amount_cents:500,occurred_at:expense.occurred_at,idempotency_key:'mobile-transfer'})})
    await client.request(`/transactions/${spent.id}`,{method:'PATCH',body:JSON.stringify({ledger_id:expense.ledger_id,version:1,amount_cents:1400,note:'修改支出',occurred_at:expense.occurred_at})})
    const accounts=await client.get<Array<{id:string;balance_cents:number}>>(`${path}/accounts`)
    expect(accounts.find(item=>item.id===expense.account_id)?.balance_cents).toBe(8100)
    expect(accounts.find(item=>item.id==='33333333-3333-4333-8333-333333333333')?.balance_cents).toBe(500)
    const bills=await client.get<{items:unknown[]}>(`${path}/transactions`)
    expect(bills.items).toHaveLength(3)
  })
  it.each(['PATCH','DELETE'])('rejects a raced edit against %s without corrupting the winning account entry', async (secondMethod) => {
    const created = await (await post('/transactions',expense)).json() as any
    let arrivals=0, release!:()=>void
    const barrier=new Promise<void>(resolve=>{release=resolve})
    const racingDatabase=new Proxy(db,{get(target,key){
      if(key==='prepare')return (sql:string)=>{
        const statement=target.prepare(sql)
        if(!sql.startsWith('SELECT kind FROM transactions') && !sql.startsWith('SELECT id FROM transactions'))return statement
        return {bind(...values:unknown[]){const bound=statement.bind(...values);return {async first(){const row=await bound.first();if(++arrivals===2)release();await barrier;return row}}}}
      }
      const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value
    }}) as D1Database
    const responses=await Promise.all([1300,1400].map((amount,index)=>{
      const method=index===1?secondMethod:'PATCH'
      return createApp().request(`/api/v1/transactions/${created.data.id}${method==='DELETE'?`?ledger_id=${expense.ledger_id}&version=1`:''}`,{method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},...(method==='PATCH'?{body:JSON.stringify({ledger_id:expense.ledger_id,version:1,amount_cents:amount,note:'race',occurred_at:expense.occurred_at})}:{})},{...env,DB:racingDatabase})
    }))
    expect(responses.filter(response=>response.status===409)).toHaveLength(1)
    expect(responses.filter(response=>response.ok)).toHaveLength(1)
    const stored=await db.prepare('SELECT amount_cents, deleted_at FROM transactions WHERE id = ?').bind(created.data.id).first<{amount_cents:number;deleted_at:string|null}>()
    const entry=await db.prepare('SELECT amount_cents FROM account_entries WHERE transaction_id = ?').bind(created.data.id).first<number>('amount_cents')
    expect(entry).toBe(stored!.deleted_at ? null : -stored!.amount_cents)
  })
})
