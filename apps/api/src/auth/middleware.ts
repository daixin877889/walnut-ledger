import type { MiddlewareHandler } from 'hono'
import type { Env } from '../env'
import { AuthRepository } from './repository'
import { verifyAccessToken } from './tokens'

export type AuthVariables = { requestId: string; userId: string; deviceId: string }
export type AuthEnv = { Bindings: Env; Variables: AuthVariables }

export const authenticate: MiddlewareHandler<AuthEnv> = async (context, next) => {
  const authorization = context.req.header('authorization')
  if (!authorization?.startsWith('Bearer ')) {
    return context.json({ code: 'UNAUTHORIZED', message: 'unauthorized', data: null, request_id: context.get('requestId') }, 401)
  }
  try {
    const claims = await verifyAccessToken(authorization.slice(7), context.env.ACCESS_TOKEN_SECRET)
    const active = await new AuthRepository(context.env.DB).findActiveDevice(claims.device_id, claims.sub)
    if (!active) throw new Error('INVALID_TOKEN')
    context.set('userId', claims.sub)
    context.set('deviceId', claims.device_id)
    await next()
  } catch {
    return context.json({ code: 'UNAUTHORIZED', message: 'unauthorized', data: null, request_id: context.get('requestId') }, 401)
  }
}
