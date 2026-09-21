import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemorySecureStore } from '../../core/session/secure-store'
import { SessionStore } from '../../core/session/session-store'
import { AuthService } from './auth-service'

describe('mobile auth service', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('stores tokens returned by login', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'OK', data: { access_token: 'access', refresh_token: 'refresh', expires_in: 900, user: { id: 'u', username: 'owner' }, device: { id: 'd', name: 'Mac' } } }), { status: 200, headers: { 'content-type': 'application/json' } })))
    const store = new SessionStore(new MemorySecureStore())
    await new AuthService('https://api.example.com', store).login({ username: 'owner', password: 'very-secure-password', device_name: 'Mac' })
    expect(await store.getAccessToken()).toBe('access')
    expect(await store.getRefreshToken()).toBe('refresh')
  })

  it('surfaces the API error code from registration', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'INVITE_INVALID', message: 'INVITE_INVALID', data: null }), { status: 422, headers: { 'content-type': 'application/json' } })))
    const service = new AuthService('https://api.example.com', new SessionStore(new MemorySecureStore()))
    await expect(service.register({ invite_code: 'bad-code', username: 'owner', password: 'very-secure-password', device_name: 'Mac' })).rejects.toThrow('INVITE_INVALID')
  })

  it('surfaces a useful error when the API returns non-JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Internal Server Error', { status: 500 })))
    const service = new AuthService('https://api.example.com', new SessionStore(new MemorySecureStore()))

    await expect(service.register({ invite_code: 'active-code', username: 'owner', password: 'very-secure-password', device_name: 'Mac' }))
      .rejects.toThrow('HTTP_500')
  })
})
