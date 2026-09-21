// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import CategoriesPage from './CategoriesPage.vue'

afterEach(() => vi.unstubAllGlobals())
it('creates, renames and archives a category through the form, preserving its server ID', async () => {
  sessionStorage.clear()
  let categories: any[] = []
  const requests: Array<{ method: string; body: any }> = []
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname
    const method = init?.method ?? 'GET'
    if (path.endsWith('/ledgers')) return Response.json({ data: [{ id: 'l', name: '家庭', role: 'owner' }] })
    if (method !== 'GET') requests.push({ method, body: init?.body ? JSON.parse(String(init.body)) : null })
    if (method === 'POST') categories = [{ ...JSON.parse(String(init?.body)), id: 'server-category', sort_order: 0, version: 1 }]
    if (method === 'PATCH') categories = [{ ...categories[0], ...JSON.parse(String(init?.body)), version: 2 }]
    if (method === 'DELETE') { categories = []; return new Response(null, { status: 204 }) }
    return Response.json({ data: method === 'GET' ? categories : categories[0] })
  })
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/categories', component: CategoriesPage }, { path: '/entry', component: { template: '<div />' } }] })
  await router.push('/categories'); await router.isReady()
  const wrapper = mount(CategoriesPage, { global: { plugins: [router] } }); await flushPromises()
  const click = async (label: string) => { await wrapper.findAll('button').find(item => item.text() === label)!.trigger('click'); await flushPromises() }
  await click('新增分类')
  await wrapper.get('input[name="name"]').setValue('咖啡')
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(wrapper.text()).toContain('咖啡')
  await click('编辑')
  await wrapper.get('input[name="name"]').setValue('饮品')
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(wrapper.text()).toContain('饮品')
  expect(requests[1]).toMatchObject({ method: 'PATCH', body: { name: '饮品', version: 1 } })
  await click('归档'); await click('确认归档')
  expect(wrapper.findAll('[data-category-row]')).toHaveLength(0)
  expect(requests.map(item => item.method)).toEqual(['POST', 'PATCH', 'DELETE'])
  wrapper.unmount()
})
