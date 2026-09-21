import { expect, it } from 'vitest'
import { transactionCsv } from './csv'
it('exports exact cents and quotes commas, line breaks and spreadsheet formulas safely',()=>{
  const csv=transactionCsv([{id:'id',ledger_id:'ledger',kind:'expense',amount_cents:1234,occurred_at:'2026-09-21T00:00:00Z',category_name:'餐饮',account_name:'现金',note:' =HYPERLINK("bad")\n早餐,咖啡',version:1}])
  expect(csv).toContain('12.34')
  expect(csv).toContain('"\' =HYPERLINK(""bad"")\n早餐,咖啡"')
  expect(csv.startsWith('\uFEFF')).toBe(true)
})
it('exports both sides of a transfer with stable account IDs',()=>{
  const csv=transactionCsv([{id:'tx',ledger_id:'l',kind:'transfer',amount_cents:500,occurred_at:'2026-09-21T00:00:00Z',version:1,account_id:'cash',account_name:'现金',transfer_account_id:'bank',transfer_account_name:'银行卡'}])
  expect(csv).toContain('转入账户ID')
  expect(csv).toContain('bank')
  expect(csv).toContain('银行卡')
})
