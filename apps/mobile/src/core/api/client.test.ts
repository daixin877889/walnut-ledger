import { describe, expect, it } from 'vitest'
import { SessionApiClient as ApiClient } from './client'
import { SessionStore } from '../session/session-store'
import { MemorySecureStore } from '../session/secure-store'

describe('authenticated API client', () => {
  it('refreshes a rejected session and retries with the new token', async () => {
    const session = new SessionStore(new MemorySecureStore())
    await session.setTokens('old', 'refresh-one')
    const requests: string[] = []
    const api = new ApiClient('https://example.test/api', session, async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        expect(JSON.parse(String(options?.body))).toEqual({ refresh_token: 'refresh-one' })
        return Response.json({ code: 'OK', data: { access_token: 'new', refresh_token: 'refresh-two' } })
      }
      requests.push(new Headers(options?.headers).get('authorization') ?? '')
      return requests.at(-1) === 'Bearer new' ? Response.json({ code: 'OK', data: [{ id: 'ledger' }] }) : new Response('', { status: 401 })
    })
    expect(await api.request('/ledgers')).toEqual([{ id: 'ledger' }])
    expect(requests).toEqual(['Bearer old', 'Bearer new'])
    expect(await session.getRefreshToken()).toBe('refresh-two')
  })
  it('does not turn an HTTP error into successful empty data', async () => {
    const api = new ApiClient('https://example.test', new SessionStore(new MemorySecureStore()), async () => Response.json({ code: 'VERSION_CONFLICT', data: null }, { status: 409 }))
    await expect(api.request('/anything')).rejects.toThrow('数据已被修改')
  })
})
