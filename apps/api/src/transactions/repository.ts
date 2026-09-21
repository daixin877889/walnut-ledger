export class TransactionRepository {
  constructor(private readonly database: D1Database) {}
  prepare(sql: string) { return this.database.prepare(sql) }
  batch(statements: D1PreparedStatement[]) { return this.database.batch(statements) }
  findIdempotent(userId: string, key: string) {
    return this.database.prepare('SELECT response_json FROM idempotency_keys WHERE user_id = ? AND idempotency_key = ? AND expires_at > ?')
      .bind(userId, key, new Date().toISOString()).first<{ response_json: string }>()
  }
  activeAccount(ledgerId: string, id: string) {
    return this.database.prepare('SELECT id FROM accounts WHERE ledger_id = ? AND id = ? AND deleted_at IS NULL').bind(ledgerId, id).first<{ id: string }>()
  }
  activeCategory(ledgerId: string, id: string, kind: string) {
    return this.database.prepare('SELECT id FROM categories WHERE ledger_id = ? AND id = ? AND kind = ? AND deleted_at IS NULL').bind(ledgerId, id, kind).first<{ id: string }>()
  }

  async listTransactions(ledgerId: string, limit: number, cursor?: string) {
    let boundary: { occurred_at: string; id: string } | undefined
    if (cursor) {
      try { boundary = JSON.parse(atob(cursor)) as { occurred_at: string; id: string } } catch { boundary = undefined }
    }
    const sql = `SELECT id, ledger_id, kind, amount_cents, account_id, category_id, transfer_account_id, note, occurred_at, version,
      (SELECT name FROM categories WHERE id = transactions.category_id AND ledger_id = transactions.ledger_id) AS category_name,
      (SELECT name FROM accounts WHERE id = transactions.account_id AND ledger_id = transactions.ledger_id) AS account_name,
      (SELECT name FROM accounts WHERE id = transactions.transfer_account_id AND ledger_id = transactions.ledger_id) AS transfer_account_name
      FROM transactions WHERE ledger_id = ? AND deleted_at IS NULL
      ${boundary ? 'AND (occurred_at < ? OR (occurred_at = ? AND id < ?))' : ''}
      ORDER BY occurred_at DESC, id DESC LIMIT ?`
    const statement = boundary
      ? this.database.prepare(sql).bind(ledgerId, boundary.occurred_at, boundary.occurred_at, boundary.id, limit + 1)
      : this.database.prepare(sql).bind(ledgerId, limit + 1)
    const rows = (await statement.all<Record<string, unknown>>()).results
    const hasMore = rows.length > limit
    const items = rows.slice(0, limit)
    const last = items.at(-1) as { occurred_at: string; id: string } | undefined
    return { items, next_cursor: hasMore && last ? btoa(JSON.stringify({ occurred_at: last.occurred_at, id: last.id })) : null }
  }
}
