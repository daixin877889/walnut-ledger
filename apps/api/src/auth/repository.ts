export type UserRow = { id: string; username: string; password_hash: string }
export type InviteRow = { id: string; max_uses: number; expires_at: string; revoked_at: string | null }
export type DeviceRow = {
  id: string
  user_id: string
  name: string
  refresh_expires_at: string
  revoked_at: string | null
}

export class AuthRepository {
  constructor(private readonly database: D1Database) {}

  findInviteByHash(hash: string) {
    return this.database
      .prepare('SELECT id, max_uses, expires_at, revoked_at FROM invite_codes WHERE code_hash = ?')
      .bind(hash)
      .first<InviteRow>()
  }

  findUserByUsername(username: string) {
    return this.database
      .prepare('SELECT id, username, password_hash FROM users WHERE username = ? COLLATE NOCASE AND status = ?')
      .bind(username, 'active')
      .first<UserRow>()
  }

  findDeviceByRefreshHash(hash: string) {
    return this.database
      .prepare('SELECT id, user_id, name, refresh_expires_at, revoked_at FROM devices WHERE refresh_token_hash = ?')
      .bind(hash)
      .first<DeviceRow>()
  }

  findActiveDevice(deviceId: string, userId: string) {
    return this.database
      .prepare('SELECT id, user_id, name, refresh_expires_at, revoked_at FROM devices WHERE id = ? AND user_id = ? AND revoked_at IS NULL')
      .bind(deviceId, userId)
      .first<DeviceRow>()
  }

  async listActiveDevices(userId: string) {
    const result = await this.database
      .prepare('SELECT id, name, last_seen_at FROM devices WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at')
      .bind(userId)
      .all<{ id: string; name: string; last_seen_at: string }>()
    return result.results
  }

  batch(statements: D1PreparedStatement[]) {
    return this.database.batch(statements)
  }

  statement(sql: string) {
    return this.database.prepare(sql)
  }
}
