import { describe, expect, it } from 'vitest'
import { buildInvite } from '../../../scripts/create-invite.mjs'

describe('admin invite generator', () => {
  it('builds a hashed invite without putting the plain code in SQL', async () => {
    const invite = await buildInvite({ code: 'WALNUT-TEST-CODE', id: 'invite-id', now: new Date('2026-09-21T00:00:00Z'), days: 30, maxUses: 10 })
    expect(invite.sql).not.toContain('WALNUT-TEST-CODE')
    expect(invite.sql).toContain('invite-id')
    expect(invite.sql).toContain('2026-10-21T00:00:00.000Z')
    expect(invite.code).toBe('WALNUT-TEST-CODE')
  })
})
