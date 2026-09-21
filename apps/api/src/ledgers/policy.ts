export type LedgerRole = 'owner' | 'editor' | 'viewer'
export type LedgerPermission = 'read' | 'write_transaction' | 'manage_ledger' | 'manage_members'

const permissions: Record<LedgerRole, ReadonlySet<LedgerPermission>> = {
  owner: new Set(['read', 'write_transaction', 'manage_ledger', 'manage_members']),
  editor: new Set(['read', 'write_transaction']),
  viewer: new Set(['read']),
}

export function can(role: LedgerRole, permission: LedgerPermission): boolean {
  return permissions[role].has(permission)
}

export async function requirePermission(
  database: D1Database,
  userId: string,
  ledgerId: string,
  permission: LedgerPermission,
): Promise<LedgerRole> {
  const membership = await database
    .prepare('SELECT role FROM ledger_members WHERE ledger_id = ? AND user_id = ? AND removed_at IS NULL')
    .bind(ledgerId, userId)
    .first<{ role: LedgerRole }>()
  if (!membership || !can(membership.role, permission)) throw new Error('LEDGER_NOT_FOUND')
  return membership.role
}
