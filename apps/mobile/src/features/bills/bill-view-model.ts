import type { LocalTransaction } from '../../core/database/types'

export function summarizeTransactions(rows: LocalTransaction[]) {
  let expenseCents = 0
  let incomeCents = 0
  for (const row of rows) {
    if (row.kind === 'income') incomeCents += row.amount_cents
    else if (row.kind === 'expense') expenseCents += row.amount_cents
  }
  return { expenseCents, incomeCents, balanceCents: incomeCents - expenseCents }
}

export function formatMoney(cents: number) {
  return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100)
}

export function groupTransactionsByDay(rows: LocalTransaction[]) {
  const groups: Array<{ date: string; rows: LocalTransaction[] }> = []
  for (const row of rows) {
    const date = row.occurred_at.slice(0, 10)
    const current = groups.at(-1)
    if (current?.date === date) current.rows.push(row)
    else groups.push({ date, rows: [row] })
  }
  return groups
}
