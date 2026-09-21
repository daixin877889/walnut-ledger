import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Miniflare } from 'miniflare'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runBatch } from '../src/db/d1'

const migrationPath = fileURLToPath(new URL('../migrations/0001_core.sql', import.meta.url))

function toD1ExecInput(sql: string): string {
  return sql.replace(/\s+/g, ' ').replace(/;\s*/g, ';\n').trim()
}

describe('D1 core migration', () => {
  let miniflare: Miniflare
  let database: D1Database

  beforeEach(async () => {
    miniflare = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
      d1Databases: ['DB'],
    })
    database = await miniflare.getD1Database('DB')
    const migration = await readFile(migrationPath, 'utf8')
    await database.exec(toD1ExecInput(migration))
  })

  afterEach(async () => {
    await miniflare.dispose()
  })

  it('creates core tables', async () => {
    const rows = await database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all<{ name: string }>()

    expect(rows.results.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        'users',
        'devices',
        'invite_codes',
        'ledgers',
        'ledger_members',
        'ledger_invites',
        'accounts',
        'categories',
        'tags',
        'transaction_tags',
        'transactions',
        'budgets',
        'idempotency_keys',
        'sync_changes',
        'operation_logs',
      ]),
    )
  })

  it('rolls back every statement when a batch member violates a constraint', async () => {
    const valid = database
      .prepare('INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .bind('user-1', 'dai', 'hash', '2026-09-21T00:00:00Z', '2026-09-21T00:00:00Z')
    const duplicate = database
      .prepare('INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .bind('user-2', 'dai', 'hash', '2026-09-21T00:00:00Z', '2026-09-21T00:00:00Z')

    await expect(runBatch(database, [valid, duplicate])).rejects.toThrow()

    const count = await database.prepare('SELECT COUNT(*) AS total FROM users').first<{ total: number }>()
    expect(count?.total).toBe(0)
  })
})
