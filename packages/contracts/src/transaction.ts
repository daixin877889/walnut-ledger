import { z } from 'zod'

const cents = z.number().int().positive().safe()
const base = {
  ledger_id: z.uuid(),
  idempotency_key: z.string().min(1).max(100),
  amount_cents: cents,
  occurred_at: z.iso.datetime(),
}

export const createExpenseSchema = z.object({
  ...base,
  account_id: z.string().min(1).max(64),
  category_id: z.string().min(1).max(64),
  note: z.string().max(500).default(''),
})

export const createTransferSchema = z.object({
  ...base,
  from_account_id: z.string().min(1).max(64),
  to_account_id: z.string().min(1).max(64),
}).refine((value) => value.from_account_id !== value.to_account_id, { message: 'accounts must differ' })

export const createAccountSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(['cash', 'bank', 'credit', 'payment', 'custom']),
  initial_balance_cents: z.number().int().safe().default(0),
})

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(['expense', 'income']),
  icon: z.string().min(1).max(80),
  color: z.string().min(1).max(32),
})

export const createTagSchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().min(1).max(32),
})

export const updateTransactionSchema = z.object({
  ledger_id: z.uuid(),
  version: z.number().int().positive(),
  amount_cents: cents,
  occurred_at: z.iso.datetime(),
  note: z.string().max(500),
})

export type CreateExpense = z.infer<typeof createExpenseSchema>
export type CreateTransfer = z.infer<typeof createTransferSchema>
export type CreateAccount = z.infer<typeof createAccountSchema>
export type CreateCategory = z.infer<typeof createCategorySchema>
export type CreateTag = z.infer<typeof createTagSchema>
export type UpdateTransaction = z.infer<typeof updateTransactionSchema>
