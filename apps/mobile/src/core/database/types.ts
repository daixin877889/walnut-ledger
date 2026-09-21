import type { PullResult } from '@walnut/contracts'
export type LocalTransaction = { id: string; ledger_id: string; amount_cents: number; occurred_at: string; version: number; [key: string]: unknown }
export type OutboxOperation = { operation_id: string; ledger_id: string; entity_type: string; entity_id: string; operation: 'upsert'|'delete'; base_version: number; payload: LocalTransaction }
export interface LocalDatabase {
  saveWithOutbox(transaction: LocalTransaction, operation: OutboxOperation): Promise<void>
  getTransaction(id: string): Promise<LocalTransaction | undefined>
  listTransactions(): Promise<LocalTransaction[]>
  listPendingOutbox(limit?: number, ledgerId?: string): Promise<OutboxOperation[]>
  acknowledge(ids: string[]): Promise<void>
  applyPullPage(page: PullResult): Promise<void>
}
