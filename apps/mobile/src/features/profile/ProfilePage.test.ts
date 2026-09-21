import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { expect, it } from 'vitest'
import ProfilePage from './ProfilePage.vue'
import { createMemoryHistory, createRouter } from 'vue-router'
it('links implemented management pages and does not assert a fabricated sync status', async () => {
  const router=createRouter({history:createMemoryHistory(),routes:['/me','/ledgers','/categories','/accounts','/devices','/budgets','/export'].map(path=>({path,component:ProfilePage}))})
  await router.push('/me');await router.isReady()
  const html=await renderToString(createSSRApp(ProfilePage).use(router))
  expect(html).toContain('href="/categories"');expect(html).toContain('href="/ledgers"')
  expect(html).not.toContain('href="#"');expect(html).not.toContain('刚刚已同步')
})
