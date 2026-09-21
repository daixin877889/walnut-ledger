// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import BudgetPage from './BudgetPage.vue'
afterEach(()=>vi.unstubAllGlobals())
it('loads and saves a monthly budget to the authorized ledger with its version',async()=>{
  let budget:any=null
  vi.stubGlobal('fetch',async(url:string,init?:RequestInit)=>{
    if(url.endsWith('/ledgers'))return Response.json({data:[{id:'l',name:'家庭',role:'owner'}]})
    if(init?.method==='PUT'){expect(JSON.parse(String(init.body))).toMatchObject({amount_cents:620000,version:0});budget={...JSON.parse(String(init.body)),version:1}}
    return Response.json({data:budget})
  })
  const router=createRouter({history:createMemoryHistory(),routes:[{path:'/budgets',component:BudgetPage},{path:'/bills',component:{template:'<div />'}}]})
  await router.push('/budgets');await router.isReady();const wrapper=mount(BudgetPage,{global:{plugins:[router]}});await flushPromises()
  await wrapper.get('input[name="amount"]').setValue('6200')
  await wrapper.get('form').trigger('submit');await flushPromises()
  expect(wrapper.get('[role="status"]').text()).toContain('已保存')
  expect(budget.amount_cents).toBe(620000);wrapper.unmount()
})
