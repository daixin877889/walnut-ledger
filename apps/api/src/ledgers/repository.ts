import type { LedgerRole } from './policy'

export type LedgerRow = { id: string; name: string; owner_id: string; currency: string; timezone: string; revision: number }
export type InviteRow = {
  id: string
  ledger_id: string
  ledger_name: string
  owner_name: string
  default_role: 'editor' | 'viewer'
  max_uses: number
  used_count: number
  expires_at: string
  revoked_at: string | null
}

export class LedgerRepository {
  constructor(private readonly database: D1Database) {}

  getForMember(ledgerId: string, userId: string) {
    return this.database.prepare(`SELECT l.id, l.name, l.owner_id, l.currency, l.timezone, l.revision
      FROM ledgers l JOIN ledger_members m ON m.ledger_id = l.id
      WHERE l.id = ? AND m.user_id = ? AND m.removed_at IS NULL AND l.deleted_at IS NULL`)
      .bind(ledgerId, userId).first<LedgerRow>()
  }

  async listForUser(userId: string) {
    const result = await this.database.prepare(`SELECT l.id, l.name, l.owner_id, l.currency, l.timezone, l.revision, m.role
      FROM ledgers l JOIN ledger_members m ON m.ledger_id = l.id
      WHERE m.user_id = ? AND m.removed_at IS NULL AND l.deleted_at IS NULL ORDER BY l.updated_at DESC`)
      .bind(userId).all<LedgerRow & { role: LedgerRole }>()
    return result.results
  }

  async listMembers(ledgerId: string) {
    const result = await this.database.prepare(`SELECT m.user_id, u.username, m.role, m.joined_at
      FROM ledger_members m JOIN users u ON u.id = m.user_id
      WHERE m.ledger_id = ? AND m.removed_at IS NULL ORDER BY m.joined_at`)
      .bind(ledgerId).all<{ user_id: string; username: string; role: LedgerRole; joined_at: string }>()
    return result.results
  }

  findInviteByHash(hash: string) {
    return this.database.prepare(`SELECT i.id, i.ledger_id, l.name AS ledger_name, u.username AS owner_name,
      i.default_role, i.max_uses, i.used_count, i.expires_at, i.revoked_at
      FROM ledger_invites i JOIN ledgers l ON l.id = i.ledger_id JOIN users u ON u.id = l.owner_id
      WHERE i.code_hash = ? AND l.deleted_at IS NULL`).bind(hash).first<InviteRow>()
  }

  membership(ledgerId: string, userId: string) {
    return this.database.prepare('SELECT role FROM ledger_members WHERE ledger_id = ? AND user_id = ? AND removed_at IS NULL')
      .bind(ledgerId, userId).first<{ role: LedgerRole }>()
  }

  prepare(sql: string) { return this.database.prepare(sql) }
  batch(statements: D1PreparedStatement[]) { return this.database.batch(statements) }
}
