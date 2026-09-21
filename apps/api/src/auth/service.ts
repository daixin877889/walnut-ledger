import type { AuthSession, LoginRequest, RegisterRequest } from '@walnut/contracts'
import { hashPassword, verifyPassword } from './password'
import { AuthRepository } from './repository'
import { createRefreshToken, sha256Hex, signAccessToken } from './tokens'

export class AuthError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: 401 | 409 | 422,
  ) {
    super(code)
  }
}

export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly secret: string,
    private readonly iterations: number,
  ) {}

  async register(input: RegisterRequest): Promise<AuthSession> {
    const now = new Date()
    const invite = await this.repository.findInviteByHash(await sha256Hex(input.invite_code))
    if (!invite || invite.revoked_at || new Date(invite.expires_at) <= now) throw new AuthError('INVITE_INVALID', 422)
    if (await this.repository.findUserByUsername(input.username)) throw new AuthError('USERNAME_TAKEN', 409)

    const userId = crypto.randomUUID()
    const deviceId = crypto.randomUUID()
    const ledgerId = crypto.randomUUID()
    const claimId = crypto.randomUUID()
    const refreshToken = createRefreshToken()
    const refreshHash = await sha256Hex(refreshToken)
    const passwordHash = await hashPassword(input.password, this.iterations)
    const createdAt = now.toISOString()
    const refreshExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()

    const statement = (sql: string) => this.repository.statement(sql)
    try {
      await this.repository.batch([
        statement(`INSERT INTO invite_code_uses (id, invite_id, user_id, created_at)
          SELECT ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM invite_code_uses WHERE invite_id = ?) < ?`)
          .bind(claimId, invite.id, userId, createdAt, invite.id, invite.max_uses),
        statement('INSERT INTO users (id, username, password_hash, invite_use_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(userId, input.username, passwordHash, claimId, createdAt, createdAt),
        statement('UPDATE invite_codes SET used_count = (SELECT COUNT(*) FROM invite_code_uses WHERE invite_id = ?) WHERE id = ?')
          .bind(invite.id, invite.id),
        statement('INSERT INTO ledgers (id, owner_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
          .bind(ledgerId, userId, '我的账本', createdAt, createdAt),
        statement('INSERT INTO ledger_members (ledger_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)')
          .bind(ledgerId, userId, 'owner', createdAt),
        statement('INSERT INTO devices (id, user_id, name, refresh_token_hash, refresh_expires_at, last_seen_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(deviceId, userId, input.device_name, refreshHash, refreshExpiresAt, createdAt, createdAt),
      ])
    } catch (error) {
      if (String(error).includes('UNIQUE')) throw new AuthError('USERNAME_TAKEN', 409)
      throw new AuthError('INVITE_INVALID', 422)
    }

    return this.session({ id: userId, username: input.username }, { id: deviceId, name: input.device_name }, refreshToken)
  }

  async login(input: LoginRequest): Promise<AuthSession> {
    const user = await this.repository.findUserByUsername(input.username)
    if (!user || !(await verifyPassword(input.password, user.password_hash))) throw new AuthError('INVALID_CREDENTIALS', 401)
    const now = new Date()
    const deviceId = crypto.randomUUID()
    const refreshToken = createRefreshToken()
    const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
    await this.repository.statement('INSERT INTO devices (id, user_id, name, refresh_token_hash, refresh_expires_at, last_seen_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(deviceId, user.id, input.device_name, await sha256Hex(refreshToken), expires, now.toISOString(), now.toISOString()).run()
    return this.session(user, { id: deviceId, name: input.device_name }, refreshToken)
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    const device = await this.repository.findDeviceByRefreshHash(await sha256Hex(refreshToken))
    const now = new Date()
    if (!device || device.revoked_at || new Date(device.refresh_expires_at) <= now) throw new AuthError('INVALID_REFRESH_TOKEN', 401)
    const user = await this.repository.statement('SELECT id, username FROM users WHERE id = ? AND status = ?')
      .bind(device.user_id, 'active').first<{ id: string; username: string }>()
    if (!user) throw new AuthError('INVALID_REFRESH_TOKEN', 401)
    const nextToken = createRefreshToken()
    const result = await this.repository.statement('UPDATE devices SET refresh_token_hash = ?, last_seen_at = ? WHERE id = ? AND refresh_token_hash = ? AND revoked_at IS NULL')
      .bind(await sha256Hex(nextToken), now.toISOString(), device.id, await sha256Hex(refreshToken)).run()
    if (result.meta.changes !== 1) throw new AuthError('INVALID_REFRESH_TOKEN', 401)
    return this.session(user, { id: device.id, name: device.name }, nextToken)
  }

  async revokeDevice(userId: string, deviceId: string): Promise<void> {
    const result = await this.repository.statement('UPDATE devices SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL')
      .bind(new Date().toISOString(), deviceId, userId).run()
    if (result.meta.changes !== 1) throw new AuthError('DEVICE_NOT_FOUND', 422)
  }

  async listDevices(userId: string, currentDeviceId: string) {
    const devices = await this.repository.listActiveDevices(userId)
    return devices.map((device) => ({ ...device, current: device.id === currentDeviceId }))
  }

  private async session(
    user: { id: string; username: string },
    device: { id: string; name: string },
    refreshToken: string,
  ): Promise<AuthSession> {
    return {
      access_token: await signAccessToken(user.id, device.id, this.secret),
      refresh_token: refreshToken,
      expires_in: 1800,
      user,
      device,
    }
  }
}
