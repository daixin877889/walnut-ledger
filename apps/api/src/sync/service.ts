import { requirePermission } from '../ledgers/policy'

export class SyncService {
  constructor(private readonly db: D1Database) {}
  async pull(userId: string, ledgerId: string, after: number, limit: number) {
    await requirePermission(this.db, userId, ledgerId, 'read')
    const rows = (await this.db.prepare('SELECT * FROM sync_changes WHERE ledger_id = ? AND revision > ? ORDER BY revision ASC LIMIT ?').bind(ledgerId, after, limit + 1).all()).results
    const changes = rows.slice(0, limit); const has_more = rows.length > limit
    return { changes, revision: Number((changes.at(-1) as any)?.revision ?? after), has_more }
  }
}
