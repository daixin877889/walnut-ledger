import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app'

describe('GET /healthz', () => {
  it('returns the standard API envelope', async () => {
    const response = await createApp().request('/healthz')

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      code: 'OK',
      message: 'ok',
      data: { ready: true },
    })
  })

  it('returns a request id in the header and body', async () => {
    const response = await createApp().request('/healthz')
    const body = (await response.json()) as { request_id: string }

    expect(body.request_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(response.headers.get('x-request-id')).toBe(body.request_id)
  })
})
