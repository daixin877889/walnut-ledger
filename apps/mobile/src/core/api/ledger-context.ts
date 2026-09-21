import { computed, ref } from 'vue'
import { SessionApiClient } from './client'
import { currentSession } from '../session/current-session'

export const api = new SessionApiClient(import.meta.env.VITE_API_BASE_URL || 'https://walnut-ledger-api.daixinmail.workers.dev/api/v1', currentSession)
export type Ledger = { id: string; name: string; role: 'owner' | 'editor' | 'viewer'; timezone?: string }
export type Category = { id: string; name: string; kind: 'expense' | 'income'; icon: string; color: string; sort_order: number; version: number }
export type Account = { id: string; name: string; type: string; balance_cents: number; version: number }

export function useLedger() {
  const ledger = ref<Ledger | null>(null)
  const error = ref('')
  const loading = ref(false)
  const canManage = computed(() => ledger.value?.role === 'owner')
  const canWrite = computed(() => !!ledger.value && ledger.value.role !== 'viewer')
  async function load() {
    const all = await api.get<Ledger[]>('/ledgers')
    // Never trust a persisted ID until the API confirms this session's membership.
    ledger.value = all.find(item => item.id === sessionStorage.getItem('walnut:ledger')) ?? all[0] ?? null
    if (!ledger.value) throw new Error('还没有账本，请到“我的 → 账本管理”创建或加入账本')
    sessionStorage.setItem('walnut:ledger', ledger.value.id)
    return ledger.value
  }
  async function run(action: () => Promise<void>) {
    if (loading.value) return
    loading.value = true; error.value = ''
    try { await action() } catch (cause) { error.value = cause instanceof Error ? cause.message : '操作失败，请重试' }
    finally { loading.value = false }
  }
  return { ledger, error, loading, canManage, canWrite, load, run }
}

export async function loadAllTransactions<T>(ledgerId: string): Promise<T[]> {
  const items: T[] = []
  let cursor: string | null = null
  do {
    const page: { items: T[]; next_cursor: string | null } = await api.get(`/ledgers/${encodeURIComponent(ledgerId)}/transactions?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
    items.push(...page.items); cursor = page.next_cursor
  } while (cursor)
  return items
}
