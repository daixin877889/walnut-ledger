import { MemorySecureStore } from './secure-store'
import { SessionStore } from './session-store'

export const currentSession = new SessionStore(new MemorySecureStore())
