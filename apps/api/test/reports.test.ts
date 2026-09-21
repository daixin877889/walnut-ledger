import { describe, expect, it } from 'vitest'
import { csvCell } from '../src/exports/csv'
import { summarizeTransactions } from '../src/reports/service'

describe('reports and export', () => {
  it('excludes transfers and subtracts refunds', () => {
    expect(summarizeTransactions([
      { kind: 'income', amount_cents: 800000 }, { kind: 'expense', amount_cents: 125000 },
      { kind: 'refund', amount_cents: 1600 }, { kind: 'transfer', amount_cents: 999999 },
    ])).toEqual({ income_cents: 800000, expense_cents: 123400, balance_cents: 676600 })
  })
  it.each(['=1+1', '+cmd', '-2', '@sum'])('neutralizes spreadsheet formula %s', value => {
    expect(csvCell(value)).toBe(`'${value}`)
  })
})
