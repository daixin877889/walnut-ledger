// @vitest-environment happy-dom
import { beforeEach, expect, it } from 'vitest'
import { BrowserSessionStore } from './secure-store'
import { SessionStore } from './session-store'
beforeEach(() => sessionStorage.clear())
it('survives store recreation on a page reload and removes credentials on logout', async () => {
  await new SessionStore(new BrowserSessionStore()).setTokens('access', 'refresh')
  const reloaded = new SessionStore(new BrowserSessionStore())
  expect(await reloaded.getAccessToken()).toBe('access')
  await reloaded.clear()
  expect(await new SessionStore(new BrowserSessionStore()).getRefreshToken()).toBeUndefined()
})
