import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const escapeSql = (value) => String(value).replaceAll("'", "''")

export async function buildInvite({ code = `WALNUT-${randomBytes(12).toString('base64url')}`, id = randomUUID(), now = new Date(), days = 30, maxUses = 10 } = {}) {
  const codeHash = createHash('sha256').update(code).digest('hex')
  const expiresAt = new Date(now.getTime() + days * 86400000).toISOString()
  const sql = `INSERT INTO invite_codes (id, code_hash, max_uses, used_count, expires_at, created_at) VALUES ('${escapeSql(id)}', '${codeHash}', ${maxUses}, 0, '${expiresAt}', '${now.toISOString()}');`
  return { code, expiresAt, sql }
}

async function main() {
  const invite = await buildInvite()
  const result = spawnSync('pnpm', ['--filter', '@walnut/api', 'exec', 'wrangler', 'd1', 'execute', 'walnut-ledger', '--remote', '--command', invite.sql], { stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
  console.log(`\n管理员邀请码（仅显示一次）：${invite.code}`)
  console.log(`有效期至：${invite.expiresAt}`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main()
