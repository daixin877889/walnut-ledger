import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'
import AppShell from './AppShell.vue'

describe('AppShell', () => {
  it('renders four primary destinations and the central entry action', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: ['/bills', '/reports', '/entry', '/accounts', '/me'].map((path) => ({ path, component: { render: () => h('div') } })),
    })
    await router.push('/bills')
    await router.isReady()
    const html = await renderToString(createSSRApp(AppShell).use(router))

    for (const [label, path] of [['账单', '/bills'], ['统计', '/reports'], ['记一笔', '/entry'], ['账户', '/accounts'], ['我的', '/me']]) {
      expect(html).toContain(`aria-label="${label}"`)
      expect(html).toContain(`href="${path}"`)
    }
  })
})
