import { Hono } from 'hono'
import { authenticate, type AuthEnv } from '../auth/middleware'
import { requirePermission } from '../ledgers/policy'
import { summarizeTransactions } from './service'
export function createReportRoutes() {
  const r = new Hono<AuthEnv>(); r.use('*', authenticate)
  r.get('/ledgers/:ledgerId/reports/monthly', async c => {
    const id = c.req.param('ledgerId'); const month = c.req.query('month') ?? new Date().toISOString().slice(0, 7)
    try { await requirePermission(c.env.DB, c.get('userId'), id, 'read') } catch { return c.json({ code: 'LEDGER_NOT_FOUND', data: null }, 404) }
    const start = `${month}-01T00:00:00.000Z`; const end = new Date(`${month}-01T00:00:00.000Z`); end.setUTCMonth(end.getUTCMonth() + 1)
    const rows = (await c.env.DB.prepare("SELECT kind, amount_cents FROM transactions WHERE ledger_id = ? AND occurred_at >= ? AND occurred_at < ? AND deleted_at IS NULL").bind(id, start, end.toISOString()).all<{ kind: string; amount_cents: number }>()).results
    return c.json({ code: 'OK', message: 'ok', data: summarizeTransactions(rows), request_id: c.get('requestId') })
  }); return r
}
