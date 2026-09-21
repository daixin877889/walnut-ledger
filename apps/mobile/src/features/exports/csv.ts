import type { LocalTransaction } from '../../core/database/types'

function cell(value: unknown) {
  let text=String(value??'')
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text="'"+text
  return /[",\r\n]/.test(text)?`"${text.replaceAll('"','""')}"`:text
}
export function transactionCsv(rows: LocalTransaction[]) {
  const header=['记录ID','账本ID','类型','金额（元）','账户ID','账户','转入账户ID','转入账户','分类ID','分类','备注','发生时间（ISO）']
  const body=rows.map(row=>[row.id,row.ledger_id,row.kind,(row.amount_cents/100).toFixed(2),row.account_id,row.account_name,row.transfer_account_id,row.transfer_account_name,row.category_id,row.category_name,row.note,row.occurred_at])
  return '\uFEFF'+[header,...body].map(row=>row.map(cell).join(',')).join('\r\n')
}
