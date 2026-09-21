import { sign, verify } from 'hono/jwt'

const encoder = new TextEncoder()

function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function createRefreshToken(): string {
  return encode(crypto.getRandomValues(new Uint8Array(32)))
}

export function signAccessToken(userId: string, deviceId: string, secret: string, now = Date.now()): Promise<string> {
  const issuedAt = Math.floor(now / 1000)
  return sign({ sub: userId, device_id: deviceId, iat: issuedAt, exp: issuedAt + 1800 }, secret, 'HS256')
}

export async function verifyAccessToken(token: string, secret: string): Promise<{ sub: string; device_id: string }> {
  const payload = await verify(token, secret, 'HS256')
  if (typeof payload.sub !== 'string' || typeof payload.device_id !== 'string') throw new Error('INVALID_TOKEN')
  return { sub: payload.sub, device_id: payload.device_id }
}
