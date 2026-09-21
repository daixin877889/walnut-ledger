// Release-blocking regression cases. Red tests document confirmed defects.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { amountCents, initialAmountState, reduceAmount } from '../src/features/entry/amount-machine'
import { groupTransactionsByDay } from '../src/features/bills/bill-view-model'
import { MemoryDatabase } from '../src/core/database/indexed-db'

describe('release audit: money and ledger correctness', () => {
  beforeAll(() => vi.stubEnv('TZ', 'Asia/Shanghai'))
  afterAll(() => vi.unstubAllEnvs())
  it('ordinary decimal entry remains exact in cents', () => {
    const state = ['1','2','.','3','4'].reduce(reduceAmount, initialAmountState())
    expect(amountCents(state)).toBe(1234)
  })
  it('saving 10 + 2 evaluates pending arithmetic (EntryPage saves using amountCents)', () => {
    const state = ['1','0','+','2'].reduce(reduceAmount, initialAmountState())
    expect(amountCents(state)).toBe(1200)
  })
  it('chained arithmetic 10 + 2 + 3 equals 15', () => {
    const state = ['1','0','+','2','+','3','='].reduce(reduceAmount, initialAmountState())
    expect(amountCents(state)).toBe(1500)
  })
  it('too many digits cannot exceed safe integer cents', () => {
    const state = [...'999999999999999999999'].reduce(reduceAmount, initialAmountState())
    expect(Number.isSafeInteger(amountCents(state))).toBe(true)
  })
  it('Shanghai same-day records do not split at UTC midnight', () => {
    const groups = groupTransactionsByDay([
      { id:'a',ledger_id:'a',amount_cents:100,occurred_at:'2026-09-21T01:00:00Z',version:1 },
      { id:'b',ledger_id:'a',amount_cents:100,occurred_at:'2026-09-20T17:00:00Z',version:1 },
    ])
    expect(groups).toHaveLength(1)
  })
  it('diagnostic: unscoped database read includes both ledgers; callers must filter', async () => {
    const db = new MemoryDatabase()
    for (const ledger_id of ['user-a-ledger','user-b-ledger']) {
      const tx = {id:ledger_id,ledger_id,amount_cents:100,occurred_at:'2026-09-21T00:00:00Z',version:1}
      await db.saveWithOutbox(tx,{operation_id:ledger_id,ledger_id,entity_type:'transaction',entity_id:tx.id,operation:'upsert',base_version:0,payload:tx})
    }
    // This proves the read is unscoped, not that the database API is incorrect.
    // BillsPage's missing caller-side filter is a separate code-review finding.
    expect((await db.listTransactions()).map(row => row.ledger_id).sort())
      .toEqual(['user-a-ledger', 'user-b-ledger'])
  })
})
