import { z } from 'zod'

export const syncChangeSchema = z.object({
  operation_id: z.string().min(1).max(100), entity_type: z.string().min(1).max(50), entity_id: z.string().min(1).max(100),
  operation: z.enum(['upsert', 'delete']), base_version: z.number().int().nonnegative(), payload: z.record(z.string(), z.unknown()),
})
export const syncPushSchema = z.object({ ledger_id: z.uuid(), changes: z.array(syncChangeSchema).min(1).max(50) })
export const syncResolveSchema = z.object({ ledger_id: z.uuid(), entity_type: z.string(), entity_id: z.string(), strategy: z.enum(['keep_local', 'use_server']), client: z.record(z.string(), z.unknown()).optional() })
export type SyncChange = z.infer<typeof syncChangeSchema>
export type PushResult = { accepted: Array<{ operation_id: string; revision: number; version: number }>; conflicts: unknown[] }
export type PullResult = { changes: unknown[]; revision: number; has_more: boolean }
