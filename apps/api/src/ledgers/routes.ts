import { changeLedgerRoleSchema, createLedgerInviteSchema, createLedgerSchema } from '@walnut/contracts'
import { Hono } from 'hono'
import { authenticate, type AuthEnv } from '../auth/middleware'
import { LedgerError, LedgerService } from './service'

function failure(context: Parameters<Parameters<Hono<AuthEnv>['onError']>[0]>[1], error: unknown) {
  if (error instanceof LedgerError) {
    return context.json({ code: error.code, message: error.message, data: null, request_id: context.get('requestId') }, error.status)
  }
  throw error
}

export function createLedgerRoutes() {
  const routes = new Hono<AuthEnv>()
  routes.use('*', authenticate)

  routes.get('/ledgers', async (context) => {
    const data = await new LedgerService(context.env.DB).list(context.get('userId'))
    return context.json({ code: 'OK', message: 'ok', data, request_id: context.get('requestId') })
  })

  routes.post('/ledgers', async (context) => {
    const parsed = createLedgerSchema.safeParse(await context.req.json().catch(() => null))
    if (!parsed.success) return context.json({ code: 'VALIDATION_ERROR', message: 'invalid request', data: null, request_id: context.get('requestId') }, 422)
    const data = await new LedgerService(context.env.DB).create(context.get('userId'), parsed.data.name)
    return context.json({ code: 'OK', message: 'ok', data, request_id: context.get('requestId') }, 201)
  })

  routes.get('/ledgers/:id', async (context) => {
    try {
      const data = await new LedgerService(context.env.DB).get(context.req.param('id'), context.get('userId'))
      return context.json({ code: 'OK', message: 'ok', data, request_id: context.get('requestId') })
    } catch (error) { return failure(context, error) }
  })

  routes.post('/ledgers/:id/invites', async (context) => {
    const parsed = createLedgerInviteSchema.safeParse(await context.req.json().catch(() => null))
    if (!parsed.success) return context.json({ code: 'VALIDATION_ERROR', message: 'invalid request', data: null, request_id: context.get('requestId') }, 422)
    try {
      const data = await new LedgerService(context.env.DB).createInvite(context.req.param('id'), context.get('userId'), parsed.data)
      return context.json({ code: 'OK', message: 'ok', data, request_id: context.get('requestId') }, 201)
    } catch (error) { return failure(context, error) }
  })

  routes.get('/ledgers/:id/members', async (context) => {
    try {
      const data = await new LedgerService(context.env.DB).members(context.req.param('id'), context.get('userId'))
      return context.json({ code: 'OK', message: 'ok', data, request_id: context.get('requestId') })
    } catch (error) { return failure(context, error) }
  })

  routes.get('/ledger-invites/:code/preview', async (context) => {
    try {
      const data = await new LedgerService(context.env.DB).preview(context.req.param('code'))
      return context.json({ code: 'OK', message: 'ok', data, request_id: context.get('requestId') })
    } catch (error) { return failure(context, error) }
  })

  routes.post('/ledger-invites/:code/join', async (context) => {
    try {
      const data = await new LedgerService(context.env.DB).join(context.req.param('code'), context.get('userId'))
      return context.json({ code: 'OK', message: 'ok', data, request_id: context.get('requestId') })
    } catch (error) { return failure(context, error) }
  })

  routes.patch('/ledgers/:id/members/:userId', async (context) => {
    const parsed = changeLedgerRoleSchema.safeParse(await context.req.json().catch(() => null))
    if (!parsed.success) return context.json({ code: 'VALIDATION_ERROR', message: 'invalid request', data: null, request_id: context.get('requestId') }, 422)
    try {
      const data = await new LedgerService(context.env.DB).changeRole(context.req.param('id'), context.get('userId'), context.req.param('userId'), parsed.data.role)
      return context.json({ code: 'OK', message: 'ok', data, request_id: context.get('requestId') })
    } catch (error) { return failure(context, error) }
  })

  routes.delete('/ledgers/:id/members/:userId', async (context) => {
    try {
      await new LedgerService(context.env.DB).removeMember(context.req.param('id'), context.get('userId'), context.req.param('userId'))
      return context.body(null, 204)
    } catch (error) { return failure(context, error) }
  })

  routes.post('/ledgers/:id/transfer-ownership', async (context) => {
    const body = await context.req.json<{ user_id?: string }>().catch(() => null)
    if (!body?.user_id) return context.json({ code: 'VALIDATION_ERROR', message: 'invalid request', data: null, request_id: context.get('requestId') }, 422)
    try {
      const data = await new LedgerService(context.env.DB).transferOwnership(context.req.param('id'), context.get('userId'), body.user_id)
      return context.json({ code: 'OK', message: 'ok', data, request_id: context.get('requestId') })
    } catch (error) { return failure(context, error) }
  })

  return routes
}
