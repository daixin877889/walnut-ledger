// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import LedgersPage from './LedgersPage.vue'

afterEach(()=>vi.unstubAllGlobals())
it('switches to a real shared ledger and loads its members',async()=>{
  sessionStorage.clear()
  vi.stubGlobal('fetch',async(url:string)=>{
    const path=new URL(url).pathname
    if(path.endsWith('/ledgers'))return Response.json({data:[{id:'a',name:'个人',role:'owner'},{id:'b',name:'家庭',role:'editor'}]})
    return Response.json({data:[{user_id:'u',username:path.includes('/b/')?'family-user':'owner',role:'owner'}]})
  })
  const router=createRouter({history:createMemoryHistory(),routes:[{path:'/ledgers',component:LedgersPage},{path:'/bills',component:{template:'<div />'}}]})
  await router.push('/ledgers');await router.isReady()
  const wrapper=mount(LedgersPage,{global:{plugins:[router]}});await flushPromises()
  await wrapper.get('[data-ledger="b"]').trigger('click');await flushPromises()
  expect(sessionStorage.getItem('walnut:ledger')).toBe('b')
  expect(wrapper.text()).toContain('family-user')
  expect(wrapper.findAll('button').some(button=>button.text()==='生成邀请码')).toBe(false)
  wrapper.unmount()
})
