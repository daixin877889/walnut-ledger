import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'
import BillsPage from './BillsPage.vue'
import { groupTransactionsByDay, summarizeTransactions } from './bill-view-model'

describe('BillsPage', () => {
  it('renders the confirmed dashboard hierarchy', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: ['/entry','/ledgers','/budgets'].map(path=>({ path, component: { render: () => h('div') } })) })
    await router.push('/entry'); await router.isReady()
    const html = await renderToString(createSSRApp(BillsPage).use(router))
    for (const text of ['核桃记账', '本月支出', '本月收入', '月度预算', '最近账单']) expect(html).toContain(text)
  })

  it('summarizes income and expense transactions in cents', () => {
    const summary = summarizeTransactions([
      { id: '1', ledger_id: 'l', amount_cents: 3250, occurred_at: '2026-09-21T08:00:00Z', version: 1, kind: 'expense' },
      { id: '2', ledger_id: 'l', amount_cents: 10000, occurred_at: '2026-09-21T09:00:00Z', version: 1, kind: 'income' },
    ])
    expect(summary).toEqual({ expenseCents: 3250, incomeCents: 10000, balanceCents: 6750 })
  })

  it('groups transactions by calendar day instead of placing every row under the newest day', () => {
    const groups = groupTransactionsByDay([
      { id: '1', ledger_id: 'l', amount_cents: 100, occurred_at: '2026-09-21T08:00:00Z', version: 1 },
      { id: '2', ledger_id: 'l', amount_cents: 200, occurred_at: '2026-09-20T08:00:00Z', version: 1 },
    ])
    expect(groups.map(group => group.rows.map(row => row.id))).toEqual([['1'], ['2']])
  })
})
