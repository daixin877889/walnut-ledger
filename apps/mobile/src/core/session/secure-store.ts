export interface SecureStore { get(key: string): Promise<string | undefined>; set(key: string, value: string): Promise<void>; remove(key: string): Promise<void> }
// Web session persistence, not an encrypted native keychain. Cleared when the tab closes.
export class BrowserSessionStore implements SecureStore {
  async get(key: string) { return sessionStorage.getItem(`walnut:session:${key}`) ?? undefined }
  async set(key: string, value: string) { sessionStorage.setItem(`walnut:session:${key}`, value) }
  async remove(key: string) { sessionStorage.removeItem(`walnut:session:${key}`) }
}
export class MemorySecureStore implements SecureStore { private values = new Map<string,string>(); async get(k:string){return this.values.get(k)} async set(k:string,v:string){this.values.set(k,v)} async remove(k:string){this.values.delete(k)} }
