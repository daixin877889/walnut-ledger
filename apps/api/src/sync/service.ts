import type { SyncChange } from '@walnut/contracts'
import { requirePermission } from '../ledgers/policy'

export class SyncService {
  constructor(private readonly db: D1Database) {}
  async push(userId: string, ledgerId: string, changes: SyncChange[]) {
    await requirePermission(this.db, userId, ledgerId, 'write_transaction')
    const accepted = []; const conflicts = []
    for (const change of changes) {
      const replay = await this.db.prepare("SELECT response_json FROM idempotency_keys WHERE user_id = ? AND idempotency_key = ? AND resource_type = 'sync'").bind(userId, change.operation_id).first<{ response_json: string }>()
      if (replay) { accepted.push(JSON.parse(replay.response_json)); continue }
      const latest = await this.db.prepare('SELECT version, payload_json, changed_by, changed_at FROM sync_changes WHERE ledger_id = ? AND entity_type = ? AND entity_id = ? ORDER BY revision DESC LIMIT 1').bind(ledgerId, change.entity_type, change.entity_id).first<{ version: number; payload_json: string; changed_by: string; changed_at: string }>()
      const serverVersion = latest?.version ?? 0
      if (change.base_version !== serverVersion) {
        conflicts.push({ entity_id: change.entity_id, entity_type: change.entity_type, client: { ...change.payload, version: change.base_version + 1 }, server: { ...(latest ? JSON.parse(latest.payload_json) : {}), version: serverVersion, updated_by: latest?.changed_by, updated_at: latest?.changed_at } })
        continue
      }
      const now = new Date().toISOString(); const version = serverVersion + 1
      const ledger = await this.db.prepare('SELECT revision FROM ledgers WHERE id = ?').bind(ledgerId).first<{ revision: number }>(); const revision = (ledger?.revision ?? 0) + 1
      const response = { operation_id: change.operation_id, revision, version }
      const business = change.entity_type === 'transaction'
        ? (change.operation === 'delete'
            ? this.db.prepare('UPDATE transactions SET deleted_at = ?, version = ?, updated_by = ?, updated_at = ? WHERE id = ? AND ledger_id = ?').bind(now, version, userId, now, change.entity_id, ledgerId)
            : this.db.prepare(`INSERT INTO transactions (id, ledger_id, kind, amount_cents, account_id, category_id, note, occurred_at, version, created_by, updated_by, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, amount_cents=excluded.amount_cents, account_id=excluded.account_id, category_id=excluded.category_id, note=excluded.note, occurred_at=excluded.occurred_at, version=excluded.version, updated_by=excluded.updated_by, updated_at=excluded.updated_at, deleted_at=NULL`)
              .bind(change.entity_id, ledgerId, String(change.payload.kind ?? 'expense'), Number(change.payload.amount_cents), change.payload.account_id ?? null, change.payload.category_id ?? null, String(change.payload.note ?? ''), String(change.payload.occurred_at), version, userId, userId, now, now))
        : undefined
      await this.db.batch([
        ...(business ? [business] : []),
        this.db.prepare('UPDATE ledgers SET revision = ?, updated_at = ? WHERE id = ?').bind(revision, now, ledgerId),
        this.db.prepare('INSERT INTO sync_changes (ledger_id, revision, entity_type, entity_id, operation, version, changed_by, changed_at, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(ledgerId, revision, change.entity_type, change.entity_id, change.operation, version, userId, now, JSON.stringify(change.payload)),
        this.db.prepare('INSERT INTO idempotency_keys (user_id, idempotency_key, resource_type, resource_id, response_json, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(userId, change.operation_id, 'sync', change.entity_id, JSON.stringify(response), now, '9999-12-31T00:00:00Z'),
      ])
      accepted.push(response)
    }
    return { accepted, conflicts }
  }
  async pull(userId: string, ledgerId: string, after: number, limit: number) {
    await requirePermission(this.db, userId, ledgerId, 'read')
    const rows = (await this.db.prepare('SELECT * FROM sync_changes WHERE ledger_id = ? AND revision > ? ORDER BY revision ASC LIMIT ?').bind(ledgerId, after, limit + 1).all()).results
    const changes = rows.slice(0, limit); const has_more = rows.length > limit
    return { changes, revision: Number((changes.at(-1) as any)?.revision ?? after), has_more }
  }
}
