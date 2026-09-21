// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import EntryPage from './EntryPage.vue'
import { currentSession } from '../../core/session/current-session'

let writes: any[]
beforeEach(async () => {
  sessionStorage.clear(); writes = []
  await currentSession.setTokens('access', 'refresh')
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const pathname = new URL(url).pathname.replace('/api/v1', '')
    if (pathname === '/ledgers') return Response.json({ data: [{ id: 'ledger-real', name: '家庭', role: 'owner' }] })
    if (pathname.endsWith('/categories')) return Response.json({ data: [{ id: 'cat-real', name: '餐饮', kind: 'expense', icon: '🍜', color: '#123456', sort_order: 0, version: 1 }] })
    if (pathname.endsWith('/accounts')) return Response.json({ data: [{ id: 'account-real', name: '现金', balance_cents: 0 }] })
    if (pathname === '/transactions') { writes.push(JSON.parse(String(init?.body))); return Response.json({ data: { id: 'saved' } }, { status: 201 }) }
    return Response.json({ code: 'NOT_FOUND' }, { status: 404 })
  })
})
afterEach(() => vi.unstubAllGlobals())
async function openEntry() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/entry', component: EntryPage }, { path: '/bills', component: { template: '<div>账单</div>' } }, { path: '/categories', component: { template: '<div>分类管理</div>' } }] })
  await router.push('/entry'); await router.isReady()
  const wrapper = mount(EntryPage, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}
it('submits evaluated amount, real category/account/ledger IDs and edited note to the backend', async () => {
  const { wrapper } = await openEntry()
  const button = (text: string) => wrapper.findAll('button').find(item => item.text() === text)!
  for (const key of ['1', '0', '＋', '2']) await button(key).trigger('click')
  await wrapper.find('[data-edit="note"]').trigger('click')
  await wrapper.find('textarea').setValue('午饭')
  await button('确定').trigger('click')
  await button('保存并继续记一笔').trigger('click'); await flushPromises()
  expect(writes).toHaveLength(1)
  expect(writes[0]).toMatchObject({ amount_cents: 1200, ledger_id: 'ledger-real', category_id: 'cat-real', account_id: 'account-real', note: '午饭', kind: 'expense' })
  expect(wrapper.get('[role="status"]').text()).toContain('已保存到云端')
  expect(wrapper.get('.amount-line > strong').text()).toBe('¥ 0')
  wrapper.unmount()
})
it('opens the actual category management route without reloading the document', async () => {
  const { wrapper, router } = await openEntry()
  await wrapper.findAll('button').find(item => item.text().includes('管理分类'))!.trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.path).toBe('/categories')
  wrapper.unmount()
})
it('keeps an uncertain save immutable and retries with the identical idempotency key', async () => {
  const delegate=globalThis.fetch
  const sent: string[]=[]
  vi.stubGlobal('fetch',async(url:string,init?:RequestInit)=>{
    if(url.endsWith('/transactions')){
      sent.push(String(init?.body))
      if(sent.length===1)throw new Error('network interrupted')
    }
    return delegate(url,init)
  })
  const {wrapper}=await openEntry()
  const button=(text:string)=>wrapper.findAll('button').find(item=>item.text()===text)!
  await button('5').trigger('click');await button('保存并继续记一笔').trigger('click');await flushPromises()
  expect(wrapper.text()).toContain('结果尚未确认')
  await button('9').trigger('click')
  expect(wrapper.get('.amount-line > strong').text()).toBe('¥ 5')
  await button('保存并继续记一笔').trigger('click');await flushPromises()
  expect(sent).toHaveLength(2);expect(sent[1]).toBe(sent[0])
  expect(wrapper.get('[role="status"]').text()).toContain('已保存到云端')
  wrapper.unmount()
})
