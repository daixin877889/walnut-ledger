import { requirePermission } from '../ledgers/policy'

export async function validateWriteAccess(database: D1Database, userId: string, ledgerId: string) {
  try { await requirePermission(database, userId, ledgerId, 'write_transaction') }
  catch { throw new TransactionError('LEDGER_NOT_FOUND', 404) }
}
export async function validateReadAccess(database:D1Database,userId:string,ledgerId:string){try{await requirePermission(database,userId,ledgerId,'read')}catch{throw new TransactionError('LEDGER_NOT_FOUND',404)}}
export async function validateManageAccess(database:D1Database,userId:string,ledgerId:string){try{await requirePermission(database,userId,ledgerId,'manage_ledger')}catch{throw new TransactionError('LEDGER_NOT_FOUND',404)}}

export class TransactionError extends Error {
  constructor(public readonly code: string, public readonly status: 404 | 409 | 422) { super(code) }
}
