import { z } from 'zod'

export const ledgerRoleSchema = z.enum(['owner', 'editor', 'viewer'])
export const inviteRoleSchema = z.enum(['editor', 'viewer'])

export const createLedgerInviteSchema = z.object({
  default_role: inviteRoleSchema,
  max_uses: z.number().int().min(1).max(100),
  expires_at: z.iso.datetime(),
})

export const changeLedgerRoleSchema = z.object({ role: inviteRoleSchema })
export const createLedgerSchema = z.object({ name: z.string().trim().min(1).max(40) })

export type LedgerRole = z.infer<typeof ledgerRoleSchema>
export type CreateLedgerInvite = z.infer<typeof createLedgerInviteSchema>
