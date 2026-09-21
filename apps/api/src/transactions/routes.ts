import { createAccountSchema, createCategorySchema, createExpenseSchema, createTagSchema, createTransferSchema, updateTransactionSchema } from '@walnut/contracts'
import { Hono } from 'hono'
import { authenticate, type AuthEnv } from '../auth/middleware'
import { TransactionService } from './service'
import { TransactionError } from './validation'

function fail(context: Parameters<Parameters<Hono<AuthEnv>['onError']>[0]>[1], error: unknown) {
  if (error instanceof TransactionError) return context.json({ code: error.code, message: error.message, data: null, request_id: context.get('requestId') }, error.status)
  throw error
}

export function createTransactionRoutes() {
  const routes = new Hono<AuthEnv>()
  routes.use('*', authenticate)
  routes.post('/transactions', async (context) => {
    const parsed = createExpenseSchema.safeParse(await context.req.json().catch(() => null))
    if (!parsed.success) return context.json({ code: 'VALIDATION_ERROR', message: 'invalid request', data: null, request_id: context.get('requestId') }, 422)
    try {
      const data = await new TransactionService(context.env.DB).createExpense(context.get('userId'), parsed.data)
      return context.json({ code: 'OK', message: 'ok', data, request_id: context.get('requestId') }, 201)
    } catch (error) { return fail(context, error) }
  })
  routes.post('/transfers', async (context) => {
    const parsed = createTransferSchema.safeParse(await context.req.json().catch(() => null))
    if (!parsed.success) return context.json({ code: 'VALIDATION_ERROR', message: 'invalid request', data: null, request_id: context.get('requestId') }, 422)
    try {
      const data = await new TransactionService(context.env.DB).createTransfer(context.get('userId'), parsed.data)
      return context.json({ code: 'OK', message: 'ok', data, request_id: context.get('requestId') }, 201)
    } catch (error) { return fail(context, error) }
  })
  const resourceSchemas = { accounts: createAccountSchema, categories: createCategorySchema, tags: createTagSchema } as const
  for (const resource of ['accounts', 'categories', 'tags'] as const) {
    routes.post(`/ledgers/:ledgerId/${resource}`, async (context) => {
      const parsed = resourceSchemas[resource].safeParse(await context.req.json().catch(() => null))
      if (!parsed.success) return context.json({ code: 'VALIDATION_ERROR', message: 'invalid request', data: null, request_id: context.get('requestId') }, 422)
      try { return context.json({ code: 'OK', message: 'ok', data: await new TransactionService(context.env.DB).createResource(context.get('userId'), context.req.param('ledgerId'), resource, parsed.data), request_id: context.get('requestId') }, 201) }
      catch (error) { return fail(context, error) }
    })
    routes.get(`/ledgers/:ledgerId/${resource}`, async (context) => {
      try { return context.json({ code: 'OK', message: 'ok', data: await new TransactionService(context.env.DB).listResources(context.get('userId'), context.req.param('ledgerId'), resource), request_id: context.get('requestId') }) }
      catch (error) { return fail(context, error) }
    })
    routes.delete(`/ledgers/:ledgerId/${resource}/:id`, async (context) => {
      try { await new TransactionService(context.env.DB).archiveResource(context.get('userId'), context.req.param('ledgerId'), resource, context.req.param('id')); return context.body(null, 204) }
      catch (error) { return fail(context, error) }
    })
  }
  routes.get('/ledgers/:ledgerId/transactions', async (context) => {
    const limit = Math.min(100, Math.max(1, Number(context.req.query('limit') ?? 50)))
    try { return context.json({ code: 'OK', message: 'ok', data: await new TransactionService(context.env.DB).listTransactions(context.get('userId'), context.req.param('ledgerId'), limit, context.req.query('cursor')), request_id: context.get('requestId') }) }
    catch (error) { return fail(context, error) }
  })
  routes.patch('/transactions/:id', async (context) => {
    const parsed = updateTransactionSchema.safeParse(await context.req.json().catch(() => null))
    if (!parsed.success) return context.json({ code: 'VALIDATION_ERROR', message: 'invalid request', data: null, request_id: context.get('requestId') }, 422)
    try { return context.json({ code: 'OK', message: 'ok', data: await new TransactionService(context.env.DB).updateTransaction(context.get('userId'), context.req.param('id'), parsed.data), request_id: context.get('requestId') }) }
    catch (error) { return fail(context, error) }
  })
  routes.delete('/transactions/:id', async (context) => {
    const ledgerId = context.req.query('ledger_id')
    const version = Number(context.req.query('version'))
    if (!ledgerId || !Number.isInteger(version) || version < 1) return context.json({ code: 'VALIDATION_ERROR', message: 'invalid request', data: null, request_id: context.get('requestId') }, 422)
    try { await new TransactionService(context.env.DB).deleteTransaction(context.get('userId'), ledgerId, context.req.param('id'), version); return context.body(null, 204) }
    catch (error) { return fail(context, error) }
  })
  return routes
}
