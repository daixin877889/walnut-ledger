import type { ApiEnvelope } from '@walnut/contracts'
import { Hono } from 'hono'
import { createAuthRoutes } from './auth/routes'
import type { Env } from './env'
import { createLedgerRoutes } from './ledgers/routes'
import { createTransactionRoutes } from './transactions/routes'
import { createSyncRoutes } from './sync/routes'
import { createReportRoutes } from './reports/routes'
import { runScheduled } from './jobs/scheduled'
import { cors } from 'hono/cors'

type Variables = {
  requestId: string
  userId: string
  deviceId: string
}

export function createApp() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>()

  app.use('*', async (context, next) => {
    const requestId = crypto.randomUUID()
    context.set('requestId', requestId)

    await next()

    context.header('x-request-id', requestId)
  })
  app.use('/api/*', cors({ origin: '*', allowHeaders: ['Authorization', 'Content-Type'], allowMethods: ['GET','POST','PATCH','DELETE','OPTIONS'] }))

  app.get('/healthz', (context) => {
    const response: ApiEnvelope<{ ready: true }> = {
      code: 'OK',
      message: 'ok',
      data: { ready: true },
      request_id: context.get('requestId'),
    }

    return context.json(response)
  })

  app.route('/api/v1/auth', createAuthRoutes())
  app.route('/api/v1', createLedgerRoutes())
  app.route('/api/v1', createTransactionRoutes())
  app.route('/api/v1', createSyncRoutes())
  app.route('/api/v1', createReportRoutes())

  return app
}

const workerApp = createApp()
export default {
  fetch: workerApp.fetch,
  scheduled(_controller: ScheduledController, env: Env, context: ExecutionContext) { context.waitUntil(runScheduled(env)) },
}
