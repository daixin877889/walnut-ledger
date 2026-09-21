export class ApiClient {
  private refreshPromise?: Promise<string>
  constructor(private baseUrl: string, private accessToken: () => string | undefined, private refresh: () => Promise<string>) {}
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const send = (token?: string) => fetch(this.baseUrl + path, { ...init, headers: { ...init.headers, ...(token ? { authorization: `Bearer ${token}` } : {}) } })
    let response = await send(this.accessToken())
    if (response.status === 401) {
      this.refreshPromise ??= this.refresh().finally(() => { this.refreshPromise = undefined })
      response = await send(await this.refreshPromise)
    }
    if (!response.ok) throw new Error(`HTTP_${response.status}`)
    return (await response.json() as { data: T }).data
  }
  get<T>(path: string) { return this.request<T>(path) }
}
