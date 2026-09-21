import type { AuthSession, LoginRequest, RegisterRequest } from '@walnut/contracts'
import type { SessionStore } from '../../core/session/session-store'

export class AuthService {
  constructor(private readonly apiBase: string, private readonly sessions: SessionStore) {}
  login(input: LoginRequest) { return this.submit('/auth/login', input) }
  register(input: RegisterRequest) { return this.submit('/auth/register', input) }
  private async submit(path: string, input: LoginRequest | RegisterRequest) {
    const response = await fetch(`${this.apiBase}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('application/json')) throw new Error(`HTTP_${response.status}`)
    const envelope = await response.json() as { code: string; message: string; data: AuthSession | null }
    if (!response.ok || !envelope.data) throw new Error(envelope.code || `HTTP_${response.status}`)
    await this.sessions.setTokens(envelope.data.access_token, envelope.data.refresh_token)
    return envelope.data
  }
}
