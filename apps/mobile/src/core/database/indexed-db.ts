import type { LocalDatabase, LocalTransaction, OutboxOperation } from './types'
export class MemoryDatabase implements LocalDatabase {
  private transactions = new Map<string, LocalTransaction>(); private outbox = new Map<string, OutboxOperation>()
  async saveWithOutbox(tx: LocalTransaction, op: OutboxOperation) { this.transactions.set(tx.id, structuredClone(tx)); this.outbox.set(op.operation_id, structuredClone(op)) }
  async getTransaction(id: string) { const value = this.transactions.get(id); return value && structuredClone(value) }
  async listTransactions() { return [...this.transactions.values()].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)) }
  async listPendingOutbox(limit = 50, ledgerId?: string) { return [...this.outbox.values()].filter(x=>!ledgerId||x.ledger_id===ledgerId).slice(0, limit) }
  async acknowledge(ids: string[]) { ids.forEach(id => this.outbox.delete(id)) }
  async applyPullPage(page: any) { for (const change of page.changes ?? []) if (change.operation === 'delete') this.transactions.delete(change.entity_id); else this.transactions.set(change.entity_id, { id: change.entity_id, ...JSON.parse(change.payload_json), version: change.version } as LocalTransaction) }
}

const result = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => { request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error) })
const done = (transaction: IDBTransaction) => new Promise<void>((resolve,reject)=>{transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error)})
export class IndexedDbDatabase implements LocalDatabase {
  constructor(private db: IDBDatabase) {}
  async saveWithOutbox(value:LocalTransaction,operation:OutboxOperation){const tx=this.db.transaction(['transactions','outbox'],'readwrite');tx.objectStore('transactions').put(value);tx.objectStore('outbox').put(operation);await done(tx)}
  async getTransaction(id:string){return result(this.db.transaction('transactions').objectStore('transactions').get(id))}
  async listTransactions(){const rows=await result(this.db.transaction('transactions').objectStore('transactions').getAll()) as LocalTransaction[];return rows.sort((a,b)=>b.occurred_at.localeCompare(a.occurred_at))}
  async listPendingOutbox(limit=50,ledgerId?:string){const rows=await result(this.db.transaction('outbox').objectStore('outbox').getAll()) as OutboxOperation[];return rows.filter(x=>!ledgerId||x.ledger_id===ledgerId).slice(0,limit)}
  async acknowledge(ids:string[]){const tx=this.db.transaction('outbox','readwrite');ids.forEach(id=>tx.objectStore('outbox').delete(id));await done(tx)}
  async applyPullPage(page:any){const tx=this.db.transaction('transactions','readwrite');const store=tx.objectStore('transactions');for(const change of page.changes??[]){if(change.entity_type!=='transaction')continue;if(change.operation==='delete')store.delete(change.entity_id);else store.put({id:change.entity_id,...JSON.parse(change.payload_json),version:change.version})}await done(tx)}
}
export const createIndexedDbDatabase = async (name='walnut-ledger') => { const request=indexedDB.open(name,1);request.onupgradeneeded=()=>{request.result.createObjectStore('transactions',{keyPath:'id'});request.result.createObjectStore('outbox',{keyPath:'operation_id'})};return new IndexedDbDatabase(await result(request)) }
