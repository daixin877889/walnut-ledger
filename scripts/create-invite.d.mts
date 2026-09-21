export type InviteOptions = { code?: string; id?: string; now?: Date; days?: number; maxUses?: number }
export function buildInvite(options?: InviteOptions): Promise<{ code: string; expiresAt: string; sql: string }>
