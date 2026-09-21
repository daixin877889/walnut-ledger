import type { SessionStore } from '../session/session-store'

export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    const messages: Record<string, string> = { VERSION_CONFLICT: '数据已被修改，请刷新后重试', LEDGER_NOT_FOUND: '账本不存在或没有操作权限', RESOURCE_NOT_FOUND: '分类或账户已失效，请刷新后重试', VALIDATION_ERROR: '填写内容不符合要求', UNAUTHORIZED: '登录已过期，请重新登录' }
    super(messages[code] ?? (status === 401 ? messages.UNAUTHORIZED : `请求失败（${code}）`))
  }
}

async function decode<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T
  const body = await response.json().catch(() => null) as { code?: string; data?: T } | null
  if (!response.ok) throw new ApiError(response.status, body?.code ?? `HTTP_${response.status}`)
  if (!body || !('data' in body)) throw new Error('服务器返回格式错误')
  return body.data as T
}

export class ApiClient {
  private refreshPromise: Promise<string> | undefined
  constructor(private baseUrl: string, private accessToken: () => string | undefined | Promise<string | undefined>, private refresh: () => Promise<string>, private transport: typeof fetch = (...args) => fetch(...args)) {}
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const send = (token?: string) => {
      const headers = new Headers(init.headers)
      if (token) headers.set('authorization', `Bearer ${token}`)
      if (init.body) headers.set('content-type', 'application/json')
      return this.transport(this.baseUrl + path, { ...init, headers })
    }
    let response = await send(await this.accessToken())
    if (response.status === 401) {
      this.refreshPromise ??= this.refresh().finally(() => { this.refreshPromise = undefined })
      response = await send(await this.refreshPromise)
    }
    return decode<T>(response)
  }
  get<T>(path: string) { return this.request<T>(path) }
}

export class SessionApiClient extends ApiClient {
  constructor(baseUrl: string, session: SessionStore, transport: typeof fetch = (...args) => fetch(...args)) {
    super(baseUrl, () => session.getAccessToken(), async () => {
      const refresh_token = await session.getRefreshToken()
      if (!refresh_token) throw new ApiError(401, 'UNAUTHORIZED')
      const response = await transport(baseUrl + '/auth/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refresh_token }) })
      if (response.status === 401) await session.clear()
      const tokens = await decode<{ access_token: string; refresh_token: string }>(response)
      await session.setTokens(tokens.access_token, tokens.refresh_token)
      return tokens.access_token
    }, transport)
  }
}
