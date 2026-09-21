import { loginRequestSchema, refreshRequestSchema, registerRequestSchema } from '@walnut/contracts'
import { Hono } from 'hono'
import type { Env } from '../env'
import { authenticate, type AuthEnv } from './middleware'
import { AuthRepository } from './repository'
import { AuthError, AuthService } from './service'
import { verifyAccessToken } from './tokens'

type AppEnv = AuthEnv

function service(env: Env): AuthService {
  const iterations = Number(env.PASSWORD_ITERATIONS)
  if (!Number.isSafeInteger(iterations) || iterations < 1_000) throw new Error('INVALID_PASSWORD_ITERATIONS')
  if (env.ENVIRONMENT === 'production' && iterations < 10_000) throw new Error('UNSAFE_PASSWORD_ITERATIONS')
  return new AuthService(new AuthRepository(env.DB), env.ACCESS_TOKEN_SECRET, iterations)
}

function errorResponse(context: Parameters<Parameters<Hono<AppEnv>['onError']>[0]>[1], error: unknown) {
  if (error instanceof AuthError) {
    return context.json({ code: error.code, message: error.message, data: null, request_id: context.get('requestId') }, error.status)
  }
  throw error
}

export function createAuthRoutes() {
  const routes = new Hono<AppEnv>()

  routes.post('/register', async (context) => {
    const parsed = registerRequestSchema.safeParse(await context.req.json().catch(() => null))
    if (!parsed.success) return context.json({ code: 'VALIDATION_ERROR', message: 'invalid request', data: null, request_id: context.get('requestId') }, 422)
    try {
      const session = await service(context.env).register(parsed.data)
      return context.json({ code: 'OK', message: 'ok', data: session, request_id: context.get('requestId') }, 201)
    } catch (error) {
      return errorResponse(context, error)
    }
  })

  routes.post('/login', async (context) => {
    const parsed = loginRequestSchema.safeParse(await context.req.json().catch(() => null))
    if (!parsed.success) return context.json({ code: 'VALIDATION_ERROR', message: 'invalid request', data: null, request_id: context.get('requestId') }, 422)
    try {
      return context.json({ code: 'OK', message: 'ok', data: await service(context.env).login(parsed.data), request_id: context.get('requestId') })
    } catch (error) {
      return errorResponse(context, error)
    }
  })

  routes.post('/refresh', async (context) => {
    const parsed = refreshRequestSchema.safeParse(await context.req.json().catch(() => null))
    if (!parsed.success) return context.json({ code: 'VALIDATION_ERROR', message: 'invalid request', data: null, request_id: context.get('requestId') }, 422)
    try {
      return context.json({ code: 'OK', message: 'ok', data: await service(context.env).refresh(parsed.data.refresh_token), request_id: context.get('requestId') })
    } catch (error) {
      return errorResponse(context, error)
    }
  })

  routes.use('/devices', authenticate)
  routes.use('/devices/*', authenticate)
  routes.use('/logout', authenticate)

  routes.get('/devices', async (context) => {
    const devices = await service(context.env).listDevices(context.get('userId'), context.get('deviceId'))
    return context.json({ code: 'OK', message: 'ok', data: devices, request_id: context.get('requestId') })
  })

  routes.post('/logout', async (context) => {
    await service(context.env).revokeDevice(context.get('userId'), context.get('deviceId'))
    return context.body(null, 204)
  })

  routes.post('/devices/:id/revoke', async (context) => {
    try {
      await service(context.env).revokeDevice(context.get('userId'), context.req.param('id'))
      return context.body(null, 204)
    } catch (error) {
      return errorResponse(context, error)
    }
  })

  return routes
}
