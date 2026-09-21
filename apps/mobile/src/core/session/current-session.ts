import { BrowserSessionStore, MemorySecureStore } from './secure-store'
import { SessionStore } from './session-store'

export const currentSession = new SessionStore(typeof sessionStorage === 'undefined' ? new MemorySecureStore() : new BrowserSessionStore())
