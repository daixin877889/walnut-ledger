import type { Env } from '../env'
export function tombstoneCutoff(now: Date) { return new Date(now.getTime() - 90 * 86400000).toISOString() }
export async function runScheduled(env: Env, now = new Date()) {
  const cutoff = tombstoneCutoff(now)
  await env.DB.prepare('DELETE FROM transactions WHERE deleted_at IS NOT NULL AND deleted_at < ?').bind(cutoff).run()
  await env.DB.prepare('DELETE FROM budgets WHERE deleted_at IS NOT NULL AND deleted_at < ?').bind(cutoff).run()
  await env.DB.prepare('DELETE FROM tags WHERE deleted_at IS NOT NULL AND deleted_at < ? AND NOT EXISTS (SELECT 1 FROM transaction_tags WHERE tag_id = tags.id)').bind(cutoff).run()
  await env.DB.prepare('DELETE FROM categories WHERE deleted_at IS NOT NULL AND deleted_at < ? AND NOT EXISTS (SELECT 1 FROM transactions WHERE category_id = categories.id)').bind(cutoff).run()
  await env.DB.prepare('DELETE FROM accounts WHERE deleted_at IS NOT NULL AND deleted_at < ? AND NOT EXISTS (SELECT 1 FROM transactions WHERE account_id = accounts.id OR transfer_account_id = accounts.id)').bind(cutoff).run()
}
