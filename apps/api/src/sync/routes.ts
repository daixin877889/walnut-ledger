import { syncPushSchema } from '@walnut/contracts'
import { Hono } from 'hono'
import { authenticate, type AuthEnv } from '../auth/middleware'
import { SyncService } from './service'

export function createSyncRoutes() {
  const routes = new Hono<AuthEnv>(); routes.use('*', authenticate)
  routes.post('/sync/push', async c => {
    const parsed = syncPushSchema.safeParse(await c.req.json().catch(() => null)); if (!parsed.success) return c.json({ code: 'VALIDATION_ERROR', message: 'invalid request', data: null, request_id: c.get('requestId') }, 422)
    try { return c.json({ code: 'OK', message: 'ok', data: await new SyncService(c.env.DB).push(c.get('userId'), parsed.data.ledger_id, parsed.data.changes), request_id: c.get('requestId') }) } catch { return c.json({ code: 'LEDGER_NOT_FOUND', message: 'not found', data: null, request_id: c.get('requestId') }, 404) }
  })
  routes.get('/sync/pull', async c => {
    const ledgerId = c.req.query('ledger_id'); if (!ledgerId) return c.json({ code: 'VALIDATION_ERROR', message: 'invalid request', data: null, request_id: c.get('requestId') }, 422)
    try { return c.json({ code: 'OK', message: 'ok', data: await new SyncService(c.env.DB).pull(c.get('userId'), ledgerId, Math.max(0, Number(c.req.query('after') ?? 0)), Math.min(500, Math.max(1, Number(c.req.query('limit') ?? 200)))), request_id: c.get('requestId') }) } catch { return c.json({ code: 'LEDGER_NOT_FOUND', message: 'not found', data: null, request_id: c.get('requestId') }, 404) }
  })
  return routes
}
