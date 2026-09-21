import type { CreateLedgerInvite } from '@walnut/contracts'
import { sha256Hex } from '../auth/tokens'
import { requirePermission, type LedgerRole } from './policy'
import { LedgerRepository } from './repository'

export class LedgerError extends Error {
  constructor(public readonly code: string, public readonly status: 404 | 409 | 422) { super(code) }
}

function inviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9))
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '').replaceAll('/', '').replaceAll('=', '').slice(0, 12).toUpperCase()
}

export class LedgerService {
  constructor(private readonly database: D1Database, private readonly repository = new LedgerRepository(database)) {}

  async get(ledgerId: string, userId: string) {
    const ledger = await this.repository.getForMember(ledgerId, userId)
    if (!ledger) throw new LedgerError('LEDGER_NOT_FOUND', 404)
    return ledger
  }

  list(userId: string) { return this.repository.listForUser(userId) }

  async create(userId: string, name: string) {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    await this.repository.batch([
      this.repository.prepare('INSERT INTO ledgers (id, owner_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .bind(id, userId, name, now, now),
      this.repository.prepare('INSERT INTO ledger_members (ledger_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)')
        .bind(id, userId, 'owner', now),
    ])
    return { id, name, owner_id: userId, currency: 'CNY', timezone: 'Asia/Shanghai', revision: 0, role: 'owner' as const }
  }

  async members(ledgerId: string, userId: string) {
    try { await requirePermission(this.database, userId, ledgerId, 'read') }
    catch { throw new LedgerError('LEDGER_NOT_FOUND', 404) }
    return this.repository.listMembers(ledgerId)
  }

  async createInvite(ledgerId: string, userId: string, input: CreateLedgerInvite) {
    await this.permission(userId, ledgerId, 'manage_members')
    if (new Date(input.expires_at) <= new Date()) throw new LedgerError('INVALID_EXPIRY', 422)
    const id = crypto.randomUUID()
    const code = inviteCode()
    const now = new Date().toISOString()
    await this.repository.prepare(`INSERT INTO ledger_invites
      (id, ledger_id, code_hash, default_role, max_uses, expires_at, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, ledgerId, await sha256Hex(code), input.default_role, input.max_uses, input.expires_at, userId, now).run()
    return { id, code, ...input }
  }

  async preview(code: string) {
    const invite = await this.validInvite(code)
    return { ledger_name: invite.ledger_name, owner_name: invite.owner_name, default_role: invite.default_role }
  }

  async join(code: string, userId: string) {
    const invite = await this.validInvite(code)
    const existing = await this.repository.membership(invite.ledger_id, userId)
    if (existing) return { ledger_id: invite.ledger_id, role: existing.role }
    const now = new Date().toISOString()
    await this.repository.batch([
      this.repository.prepare(`INSERT OR IGNORE INTO ledger_invite_uses (invite_id, user_id, created_at)
        SELECT ?, ?, ? WHERE (SELECT COUNT(*) FROM ledger_invite_uses WHERE invite_id = ?) < ?`)
        .bind(invite.id, userId, now, invite.id, invite.max_uses),
      this.repository.prepare(`INSERT OR IGNORE INTO ledger_members (ledger_id, user_id, role, joined_at)
        SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM ledger_invite_uses WHERE invite_id = ? AND user_id = ?)`)
        .bind(invite.ledger_id, userId, invite.default_role, now, invite.id, userId),
      this.repository.prepare('UPDATE ledger_invites SET used_count = (SELECT COUNT(*) FROM ledger_invite_uses WHERE invite_id = ?) WHERE id = ?')
        .bind(invite.id, invite.id),
      this.audit(invite.ledger_id, userId, 'member.joined', 'member', userId, now),
    ])
    const membership = await this.repository.membership(invite.ledger_id, userId)
    if (!membership) throw new LedgerError('INVITE_INVALID', 422)
    return { ledger_id: invite.ledger_id, role: membership.role }
  }

  async changeRole(ledgerId: string, actorId: string, memberId: string, role: Exclude<LedgerRole, 'owner'>) {
    await this.permission(actorId, ledgerId, 'manage_members')
    const now = new Date().toISOString()
    const result = await this.repository.batch([
      this.repository.prepare(`UPDATE ledger_members SET role = ? WHERE ledger_id = ? AND user_id = ?
        AND role != 'owner' AND removed_at IS NULL`).bind(role, ledgerId, memberId),
      this.repository.prepare(`INSERT INTO operation_logs
        (id, ledger_id, actor_id, action, entity_type, entity_id, created_at)
        SELECT ?, ?, ?, 'member.role_changed', 'member', ?, ?
        WHERE EXISTS (SELECT 1 FROM ledger_members WHERE ledger_id = ? AND user_id = ? AND role = ? AND removed_at IS NULL)`)
        .bind(crypto.randomUUID(), ledgerId, actorId, memberId, now, ledgerId, memberId, role),
    ])
    if (result[0]?.meta.changes !== 1) throw new LedgerError('MEMBER_NOT_FOUND', 404)
    return { user_id: memberId, role }
  }

  async removeMember(ledgerId: string, actorId: string, memberId: string) {
    await this.permission(actorId, ledgerId, 'manage_members')
    const now = new Date().toISOString()
    const result = await this.repository.batch([
      this.repository.prepare(`UPDATE ledger_members SET removed_at = ? WHERE ledger_id = ? AND user_id = ?
        AND role != 'owner' AND removed_at IS NULL`).bind(now, ledgerId, memberId),
      this.repository.prepare(`INSERT INTO operation_logs
        (id, ledger_id, actor_id, action, entity_type, entity_id, created_at)
        SELECT ?, ?, ?, 'member.removed', 'member', ?, ?
        WHERE EXISTS (SELECT 1 FROM ledger_members WHERE ledger_id = ? AND user_id = ? AND removed_at = ?)`)
        .bind(crypto.randomUUID(), ledgerId, actorId, memberId, now, ledgerId, memberId, now),
    ])
    if (result[0]?.meta.changes !== 1) throw new LedgerError('MEMBER_NOT_FOUND', 404)
  }

  async transferOwnership(ledgerId: string, actorId: string, nextOwnerId: string) {
    await this.permission(actorId, ledgerId, 'manage_members')
    const target = await this.repository.membership(ledgerId, nextOwnerId)
    if (!target || target.role === 'owner') throw new LedgerError('MEMBER_NOT_FOUND', 404)
    const now = new Date().toISOString()
    await this.repository.batch([
      this.repository.prepare('UPDATE ledgers SET owner_id = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
        .bind(nextOwnerId, now, ledgerId, actorId),
      this.repository.prepare('UPDATE ledger_members SET role = ? WHERE ledger_id = ? AND user_id = ? AND EXISTS (SELECT 1 FROM ledgers WHERE id = ? AND owner_id = ?)')
        .bind('editor', ledgerId, actorId, ledgerId, nextOwnerId),
      this.repository.prepare('UPDATE ledger_members SET role = ? WHERE ledger_id = ? AND user_id = ? AND EXISTS (SELECT 1 FROM ledgers WHERE id = ? AND owner_id = ?)')
        .bind('owner', ledgerId, nextOwnerId, ledgerId, nextOwnerId),
      this.audit(ledgerId, actorId, 'ledger.ownership_transferred', 'member', nextOwnerId, now),
    ])
    return { owner_id: nextOwnerId }
  }

  private async permission(userId: string, ledgerId: string, permission: 'manage_members') {
    try { return await requirePermission(this.database, userId, ledgerId, permission) }
    catch { throw new LedgerError('LEDGER_NOT_FOUND', 404) }
  }

  private async validInvite(code: string) {
    const invite = await this.repository.findInviteByHash(await sha256Hex(code))
    if (!invite || invite.revoked_at || new Date(invite.expires_at) <= new Date() || invite.used_count >= invite.max_uses) {
      throw new LedgerError('INVITE_INVALID', 422)
    }
    return invite
  }

  private audit(ledgerId: string, actorId: string, action: string, entityType: string, entityId: string, now: string) {
    return this.repository.prepare(`INSERT INTO operation_logs
      (id, ledger_id, actor_id, action, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), ledgerId, actorId, action, entityType, entityId, now)
  }
}
