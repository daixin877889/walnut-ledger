import { describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { createIndexedDbDatabase } from './indexed-db'
import { createSqliteDatabase } from './sqlite'
for (const [name, create] of [['IndexedDB', createIndexedDbDatabase], ['SQLite', createSqliteDatabase]] as const) describe(name, () => {
  it('persists a transaction and outbox across adapter instances', async () => { const databaseName=`${name}-${crypto.randomUUID()}`; const db = await create(databaseName); const tx = { id: 't1', ledger_id: 'l1', amount_cents: 2850, occurred_at: '2026-09-21', version: 1 }; await db.saveWithOutbox(tx, { operation_id: 'o1', ledger_id: 'l1', entity_type:'transaction',entity_id: 't1',operation:'upsert',base_version:0,payload: tx }); const reopened=await create(databaseName); expect(await reopened.getTransaction('t1')).toEqual(tx); expect(await reopened.listPendingOutbox()).toHaveLength(1) })
})
