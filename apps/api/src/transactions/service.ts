import type { CreateAccount, CreateCategory, CreateExpense, CreateTag, CreateTransfer, UpdateTransaction } from '@walnut/contracts'
import { TransactionRepository } from './repository'
import { TransactionError, validateManageAccess, validateReadAccess, validateWriteAccess } from './validation'

type CreatedTransaction = { id: string; ledger_id: string; kind: 'expense' | 'income' | 'transfer'; amount_cents: number; version: 1 }

export class TransactionService {
  private readonly repository: TransactionRepository
  constructor(private readonly database: D1Database) { this.repository = new TransactionRepository(database) }

  async getBudget(userId:string,ledgerId:string,month:string){
    await validateReadAccess(this.database,userId,ledgerId)
    return this.database.prepare('SELECT id, ledger_id, month, amount_cents, version FROM budgets WHERE id = ? AND ledger_id = ? AND deleted_at IS NULL').bind(`${ledgerId}:${month}:total`,ledgerId).first()
  }

  async setBudget(userId:string,ledgerId:string,input:{month:string;amount_cents:number;version:number}){
    await validateManageAccess(this.database,userId,ledgerId)
    const id=`${ledgerId}:${input.month}:total`,now=new Date().toISOString()
    const result=input.version===0
      ? await this.database.prepare('INSERT OR IGNORE INTO budgets (id, ledger_id, month, amount_cents, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(id,ledgerId,input.month,input.amount_cents,userId,userId,now,now).run()
      : await this.database.prepare('UPDATE budgets SET amount_cents = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE id = ? AND ledger_id = ? AND version = ? AND deleted_at IS NULL').bind(input.amount_cents,userId,now,id,ledgerId,input.version).run()
    if(result.meta.changes!==1)throw new TransactionError('VERSION_CONFLICT',409)
    return this.getBudget(userId,ledgerId,input.month)
  }

  async createExpense(userId: string, input: CreateExpense): Promise<CreatedTransaction> {
    await validateWriteAccess(this.database, userId, input.ledger_id)
    const replay = await this.replay(userId, input.idempotency_key)
    if (replay) return replay
    if (!(await this.repository.activeAccount(input.ledger_id, input.account_id)) || !(await this.repository.activeCategory(input.ledger_id, input.category_id, input.kind))) throw new TransactionError('RESOURCE_NOT_FOUND', 404)
    const created = { id: crypto.randomUUID(), ledger_id: input.ledger_id, kind: input.kind, amount_cents: input.amount_cents, version: 1 as const }
    const now = new Date().toISOString()
    await this.repository.batch([
      this.repository.prepare(`INSERT INTO transactions
        (id, ledger_id, kind, amount_cents, account_id, category_id, note, occurred_at, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(created.id, input.ledger_id, input.kind, input.amount_cents, input.account_id, input.category_id, input.note, input.occurred_at, userId, userId, now, now),
      this.repository.prepare('INSERT INTO account_entries (id, ledger_id, account_id, transaction_id, amount_cents, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), input.ledger_id, input.account_id, created.id, input.kind === 'income' ? input.amount_cents : -input.amount_cents, now),
      this.idempotency(userId, input.idempotency_key, created, now),
    ])
    return created
  }

  async createTransfer(userId: string, input: CreateTransfer): Promise<CreatedTransaction> {
    await validateWriteAccess(this.database, userId, input.ledger_id)
    const replay = await this.replay(userId, input.idempotency_key)
    if (replay) return replay
    const [from, to] = await Promise.all([this.repository.activeAccount(input.ledger_id, input.from_account_id), this.repository.activeAccount(input.ledger_id, input.to_account_id)])
    if (!from || !to) throw new TransactionError('RESOURCE_NOT_FOUND', 404)
    const created = { id: crypto.randomUUID(), ledger_id: input.ledger_id, kind: 'transfer' as const, amount_cents: input.amount_cents, version: 1 as const }
    const now = new Date().toISOString()
    await this.repository.batch([
      this.repository.prepare(`INSERT INTO transactions
        (id, ledger_id, kind, amount_cents, account_id, transfer_account_id, note, occurred_at, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, 'transfer', ?, ?, ?, '', ?, ?, ?, ?, ?)`)
        .bind(created.id, input.ledger_id, input.amount_cents, input.from_account_id, input.to_account_id, input.occurred_at, userId, userId, now, now),
      this.repository.prepare('INSERT INTO account_entries (id, ledger_id, account_id, transaction_id, amount_cents, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), input.ledger_id, input.from_account_id, created.id, -input.amount_cents, now),
      this.repository.prepare('INSERT INTO account_entries (id, ledger_id, account_id, transaction_id, amount_cents, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), input.ledger_id, input.to_account_id, created.id, input.amount_cents, now),
      this.idempotency(userId, input.idempotency_key, created, now),
    ])
    return created
  }

  async createResource(userId: string, ledgerId: string, resource: 'accounts' | 'categories' | 'tags', input: CreateAccount | CreateCategory | CreateTag) {
    await validateManageAccess(this.database, userId, ledgerId)
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    if (resource === 'accounts') {
      const value = input as CreateAccount
      await this.database.prepare('INSERT INTO accounts (id, ledger_id, name, type, initial_balance_cents, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, ledgerId, value.name, value.type, value.initial_balance_cents, userId, userId, now, now).run()
    } else if (resource === 'categories') {
      const value = input as CreateCategory
      await this.database.prepare('INSERT INTO categories (id, ledger_id, kind, name, icon, color, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, ledgerId, value.kind, value.name, value.icon, value.color, userId, userId, now, now).run()
    } else {
      const value = input as CreateTag
      await this.database.prepare('INSERT INTO tags (id, ledger_id, name, color, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(id, ledgerId, value.name, value.color, userId, userId, now, now).run()
    }
    return { id, ledger_id: ledgerId, ...input, version: 1 }
  }

  async listResources(userId: string, ledgerId: string, resource: 'accounts' | 'categories' | 'tags') {
    await validateReadAccess(this.database, userId, ledgerId)
    if (resource === 'accounts') return (await this.database.prepare(`SELECT a.*, a.initial_balance_cents + COALESCE((SELECT SUM(e.amount_cents) FROM account_entries e WHERE e.account_id = a.id AND e.ledger_id = a.ledger_id), 0) AS balance_cents FROM accounts a WHERE a.ledger_id = ? AND a.deleted_at IS NULL ORDER BY a.sort_order, a.created_at`).bind(ledgerId).all()).results
    const order = resource === 'tags' ? 'created_at ASC' : 'sort_order ASC, created_at ASC'
    return (await this.database.prepare(`SELECT * FROM ${resource} WHERE ledger_id = ? AND deleted_at IS NULL ORDER BY ${order}`).bind(ledgerId).all()).results
  }

  async updateCategory(userId: string, ledgerId: string, id: string, input: { name: string; icon: string; color: string; sort_order: number; version: number }) {
    await validateManageAccess(this.database, userId, ledgerId)
    const result = await this.database.prepare('UPDATE categories SET name = ?, icon = ?, color = ?, sort_order = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE id = ? AND ledger_id = ? AND version = ? AND deleted_at IS NULL')
      .bind(input.name, input.icon, input.color, input.sort_order, userId, new Date().toISOString(), id, ledgerId, input.version).run()
    if (!result.meta.changes) throw new TransactionError('VERSION_CONFLICT', 409)
    return this.database.prepare('SELECT * FROM categories WHERE id = ? AND ledger_id = ?').bind(id, ledgerId).first()
  }

  async createCategories(userId: string, ledgerId: string, categories: CreateCategory[]) {
    await validateManageAccess(this.database, userId, ledgerId)
    const now = new Date().toISOString()
    await this.database.batch(categories.map((item, index) => this.database.prepare(`INSERT INTO categories (id, ledger_id, kind, name, icon, color, sort_order, created_by, updated_by, created_at, updated_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM categories WHERE ledger_id = ? AND kind = ? AND name = ? AND deleted_at IS NULL)`)
      .bind(crypto.randomUUID(), ledgerId, item.kind, item.name, item.icon, item.color, index, userId, userId, now, now, ledgerId, item.kind, item.name)))
    return this.listResources(userId, ledgerId, 'categories')
  }

  async archiveResource(userId: string, ledgerId: string, resource: 'accounts' | 'categories' | 'tags', id: string) {
    await validateManageAccess(this.database, userId, ledgerId)
    const now = new Date().toISOString()
    const result = await this.database.prepare(`UPDATE ${resource} SET deleted_at = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ? AND ledger_id = ? AND deleted_at IS NULL`).bind(now, now, userId, id, ledgerId).run()
    if (!result.meta.changes) throw new TransactionError('RESOURCE_NOT_FOUND', 404)
  }

  async listTransactions(userId: string, ledgerId: string, limit: number, cursor?: string) {
    await validateReadAccess(this.database, userId, ledgerId)
    return this.repository.listTransactions(ledgerId, limit, cursor)
  }

  async updateTransaction(userId: string, id: string, input: UpdateTransaction) {
    await validateWriteAccess(this.database, userId, input.ledger_id)
    const now = new Date().toISOString()
    const current = await this.database.prepare('SELECT kind FROM transactions WHERE id = ? AND ledger_id = ? AND version = ? AND deleted_at IS NULL').bind(id, input.ledger_id, input.version).first<{kind:string}>()
    if (!current) throw new TransactionError('VERSION_CONFLICT', 409)
    // D1 batches are atomic. Guard the balance mutation with the same old version,
    // then advance that version in the same batch. A stale batch changes neither.
    const guard = ' WHERE transaction_id = ? AND ledger_id = ? AND EXISTS (SELECT 1 FROM transactions WHERE id = ? AND ledger_id = ? AND version = ? AND deleted_at IS NULL)'
    const entries = current.kind === 'transfer'
      ? this.database.prepare('UPDATE account_entries SET amount_cents = CASE WHEN amount_cents < 0 THEN ? ELSE ? END' + guard).bind(-input.amount_cents, input.amount_cents, id, input.ledger_id, id, input.ledger_id, input.version)
      : this.database.prepare('UPDATE account_entries SET amount_cents = ?' + guard).bind(current.kind === 'income' ? input.amount_cents : -input.amount_cents, id, input.ledger_id, id, input.ledger_id, input.version)
    const results = await this.database.batch([entries, this.database.prepare(`UPDATE transactions SET amount_cents = ?, note = ?, occurred_at = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE id = ? AND ledger_id = ? AND version = ? AND deleted_at IS NULL`).bind(input.amount_cents, input.note, input.occurred_at, userId, now, id, input.ledger_id, input.version)])
    if (results[1]?.meta.changes !== 1) throw new TransactionError('VERSION_CONFLICT', 409)
    return this.database.prepare('SELECT id, ledger_id, kind, amount_cents, note, occurred_at, version FROM transactions WHERE id = ?').bind(id).first()
  }

  async deleteTransaction(userId: string, ledgerId: string, id: string, version: number) {
    await validateWriteAccess(this.database, userId, ledgerId)
    const now = new Date().toISOString()
    const current = await this.database.prepare('SELECT id FROM transactions WHERE id = ? AND ledger_id = ? AND version = ? AND deleted_at IS NULL').bind(id, ledgerId, version).first()
    if (!current) throw new TransactionError('VERSION_CONFLICT', 409)
    const results = await this.database.batch([
      this.database.prepare('DELETE FROM account_entries WHERE transaction_id = ? AND ledger_id = ? AND EXISTS (SELECT 1 FROM transactions WHERE id = ? AND ledger_id = ? AND version = ? AND deleted_at IS NULL)').bind(id, ledgerId, id, ledgerId, version),
      this.database.prepare('UPDATE transactions SET deleted_at = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ? AND ledger_id = ? AND version = ? AND deleted_at IS NULL').bind(now, now, userId, id, ledgerId, version),
    ])
    if (results[1]?.meta.changes !== 1) throw new TransactionError('VERSION_CONFLICT', 409)
  }

  private async replay(userId: string, key: string) {
    const row = await this.repository.findIdempotent(userId, key)
    return row ? JSON.parse(row.response_json) as CreatedTransaction : null
  }

  private idempotency(userId: string, key: string, response: CreatedTransaction, now: string) {
    const expires = new Date(new Date(now).getTime() + 24 * 60 * 60 * 1000).toISOString()
    return this.repository.prepare('INSERT INTO idempotency_keys (user_id, idempotency_key, resource_type, resource_id, response_json, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(userId, key, 'transaction', response.id, JSON.stringify(response), now, expires)
  }
}
