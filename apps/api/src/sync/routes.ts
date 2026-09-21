import { Hono } from 'hono'
import { authenticate, type AuthEnv } from '../auth/middleware'
import { SyncService } from './service'

export function createSyncRoutes() {
  const routes = new Hono<AuthEnv>(); routes.use('*', authenticate)
  // Fail closed: legacy push bypasses accounting and resource authorization.
  // Online writes use the validated transaction/category/account endpoints.
  routes.post('/sync/push', c => c.json({ code: 'SYNC_NOT_AVAILABLE', message: '离线同步尚未开放，请使用联网记账', data: null, request_id: c.get('requestId') }, 503))
  routes.get('/sync/pull', async c => {
    const ledgerId = c.req.query('ledger_id'); if (!ledgerId) return c.json({ code: 'VALIDATION_ERROR', message: 'invalid request', data: null, request_id: c.get('requestId') }, 422)
    try { return c.json({ code: 'OK', message: 'ok', data: await new SyncService(c.env.DB).pull(c.get('userId'), ledgerId, Math.max(0, Number(c.req.query('after') ?? 0)), Math.min(500, Math.max(1, Number(c.req.query('limit') ?? 200)))), request_id: c.get('requestId') }) } catch { return c.json({ code: 'LEDGER_NOT_FOUND', message: 'not found', data: null, request_id: c.get('requestId') }, 404) }
  })
  return routes
}
