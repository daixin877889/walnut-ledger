export const coreTables = [
  'users',
  'devices',
  'invite_codes',
  'invite_code_uses',
  'ledgers',
  'ledger_members',
  'ledger_invites',
  'ledger_invite_uses',
  'accounts',
  'categories',
  'tags',
  'transactions',
  'account_entries',
  'transaction_members',
  'transaction_tags',
  'budgets',
  'idempotency_keys',
  'sync_changes',
  'operation_logs',
] as const

export type CoreTable = (typeof coreTables)[number]
