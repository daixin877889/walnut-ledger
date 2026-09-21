// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import BillsPage from './BillsPage.vue'
import ReportsPage from '../reports/ReportsPage.vue'
import AccountsPage from '../accounts/AccountsPage.vue'

beforeEach(() => {
  sessionStorage.clear(); sessionStorage.setItem('walnut:ledger', 'other-user-ledger')
  const now = new Date(); const current = new Date(now.getFullYear(), now.getMonth(), 10, 12).toISOString(); const prior = new Date(now.getFullYear(), now.getMonth() - 1, 10, 12).toISOString()
  let accounts: any[] = [{ id: 'cash', name: '现金', type: 'cash', balance_cents: 12345, version: 1 }]
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname.replace('/api/v1', '')
    if (path === '/ledgers') return Response.json({ data: [{ id: 'current-ledger', name: '我的账本', role: 'owner' }] })
    if (path.includes('other-user-ledger')) throw new Error('attempted unauthorized ledger read')
    if (path.endsWith('/transactions')) return Response.json({ data: { items: [{ id: 'one', ledger_id: 'current-ledger', kind: 'expense', amount_cents: 1250, category_name: '餐饮', account_name: '现金', note: '午餐', occurred_at: current, version: 1 }, { id: 'prior', ledger_id: 'current-ledger', kind: 'expense', amount_cents: 90000, occurred_at: prior, version: 1 }], next_cursor: null } })
    if (path.endsWith('/accounts')) {
      if (init?.method === 'POST') accounts.push({ ...JSON.parse(String(init.body)), id: 'bank', balance_cents: 50000, version: 1 })
      return Response.json({ data: init?.method === 'POST' ? accounts.at(-1) : accounts })
    }
    return Response.json({ data: [] })
  })
})
afterEach(() => vi.unstubAllGlobals())
async function open(component: any) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component }, ...['/entry','/ledgers','/budgets'].map(path=>({path,component:{template:'<div />'}}))] })
  await router.push('/'); await router.isReady()
  const wrapper = mount(component, { global: { plugins: [router] } }); await flushPromises(); return wrapper
}
it('shows only the selected month from the authorized ledger, then filters by a search query', async () => {
  const wrapper = await open(BillsPage)
  expect(wrapper.findAll('.bill-row')).toHaveLength(1)
  expect(wrapper.find('.summary-grid').text()).toContain('12.50')
  await wrapper.get('input[type="search"]').setValue('不存在')
  expect(wrapper.findAll('.bill-row')).toHaveLength(0)
  expect(sessionStorage.getItem('walnut:ledger')).toBe('current-ledger')
  wrapper.unmount()
})
it('computes report expenses and category shares from transactions rather than fixed charts', async () => {
  const wrapper = await open(ReportsPage)
  expect(wrapper.find('.card-head h2').text()).toBe('¥ 12.50')
  expect(wrapper.find('.legend').text()).toContain('100%')
  await wrapper.findAll('button').find(button => button.text() === '上月')!.trigger('click')
  expect(wrapper.find('.card-head h2').text()).toBe('¥ 900.00')
  wrapper.unmount()
})
it('loads real account balances and creates an account with a cent-based opening balance', async () => {
  const wrapper = await open(AccountsPage)
  expect(wrapper.find('.asset-card h2').text()).toBe('¥ 123.45')
  await wrapper.findAll('button').find(button => button.text().includes('新建'))!.trigger('click')
  await wrapper.get('input[name="name"]').setValue('储蓄卡')
  await wrapper.get('input[name="balance"]').setValue('500.00')
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(wrapper.findAll('.account')).toHaveLength(2)
  expect(wrapper.find('.asset-card h2').text()).toBe('¥ 623.45')
  wrapper.unmount()
})
it('edits and deletes a bill through versioned requests and reloads the list', async () => {
  let bill: any = {id:'bill',ledger_id:'l',kind:'expense',amount_cents:100,occurred_at:new Date().toISOString(),note:'原备注',version:1}
  vi.stubGlobal('fetch',async(url:string,init?:RequestInit)=>{
    const path=new URL(url).pathname
    if(path.endsWith('/ledgers'))return Response.json({data:[{id:'l',name:'账本',role:'owner'}]})
    if(init?.method==='PATCH'){const body=JSON.parse(String(init.body));expect(body).toMatchObject({ledger_id:'l',version:1,amount_cents:1234,note:'已修改'});bill={...bill,...body,version:2};return Response.json({data:bill})}
    if(init?.method==='DELETE'){expect(url).toContain('version=2');bill=null;return new Response(null,{status:204})}
    return Response.json({data:{items:bill?[bill]:[],next_cursor:null}})
  })
  const wrapper=await open(BillsPage)
  await wrapper.get('.bill-row').trigger('click')
  await wrapper.get('input[name="amount"]').setValue('12.34')
  await wrapper.get('textarea').setValue('已修改')
  await wrapper.get('form').trigger('submit');await flushPromises()
  expect(wrapper.get('.bill-row').text()).toContain('12.34')
  await wrapper.get('.bill-row').trigger('click')
  await wrapper.findAll('button').find(item=>item.text()==='删除账单')!.trigger('click')
  await wrapper.findAll('button').find(item=>item.text()==='确认删除')!.trigger('click');await flushPromises()
  expect(wrapper.findAll('.bill-row')).toHaveLength(0)
  wrapper.unmount()
})
it('keeps the same month/day in different years separate in a custom report',async()=>{
  vi.stubGlobal('fetch',async(url:string)=>url.endsWith('/ledgers')?Response.json({data:[{id:'l',name:'账本',role:'owner'}]}):Response.json({data:{items:[{id:'a',ledger_id:'l',kind:'expense',amount_cents:100,occurred_at:'2025-09-21T12:00:00Z',version:1},{id:'b',ledger_id:'l',kind:'expense',amount_cents:200,occurred_at:'2026-09-21T12:00:00Z',version:1}],next_cursor:null}}))
  const wrapper=await open(ReportsPage)
  await wrapper.findAll('button').find(item=>item.text()==='自定义')!.trigger('click')
  const inputs=wrapper.findAll('input[type="date"]');await inputs[0].setValue('2025-01-01');await inputs[1].setValue('2026-12-31')
  expect(wrapper.findAll('.bar-chart i')).toHaveLength(2)
  expect(wrapper.get('.card-head h2').text()).toBe('¥ 3.00')
  wrapper.unmount()
})
