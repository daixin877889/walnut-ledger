// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import DevicesPage from './DevicesPage.vue'
afterEach(()=>vi.unstubAllGlobals())
it('shows actual login devices and removes a revoked device after confirmation',async()=>{
  let devices=[{id:'current',name:'本机',current:true,last_seen_at:'2026-09-21T00:00:00Z'},{id:'other',name:'旧手机',current:false,last_seen_at:'2026-09-20T00:00:00Z'}]
  vi.stubGlobal('fetch',async(url:string,init?:RequestInit)=>{
    if(init?.method==='POST'){expect(url).toContain('/auth/devices/other/revoke');devices=devices.filter(item=>item.id!=='other');return new Response(null,{status:204})}
    return Response.json({data:devices})
  })
  const router=createRouter({history:createMemoryHistory(),routes:[{path:'/devices',component:DevicesPage},{path:'/me',component:{template:'<div />'}},{path:'/login',component:{template:'<div />'}}]})
  await router.push('/devices');await router.isReady()
  const wrapper=mount(DevicesPage,{global:{plugins:[router]}});await flushPromises()
  expect(wrapper.text()).toContain('旧手机')
  await wrapper.findAll('button').find(item=>item.text()==='撤销登录')!.trigger('click')
  await wrapper.findAll('button').find(item=>item.text()==='确认撤销')!.trigger('click');await flushPromises()
  expect(wrapper.text()).not.toContain('旧手机')
  expect(wrapper.text()).toContain('本机')
  wrapper.unmount()
})
