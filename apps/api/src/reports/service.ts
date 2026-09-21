type Row = { kind: string; amount_cents: number }
export function summarizeTransactions(rows: Row[]) {
  let income_cents = 0; let expense_cents = 0
  for (const row of rows) {
    if (row.kind === 'income') income_cents += row.amount_cents
    else if (row.kind === 'expense') expense_cents += row.amount_cents
    else if (row.kind === 'refund') expense_cents -= row.amount_cents
  }
  return { income_cents, expense_cents, balance_cents: income_cents - expense_cents }
}
