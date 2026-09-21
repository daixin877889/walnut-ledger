// @vitest-environment happy-dom
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import EntryPage from './EntryPage.vue'

describe('EntryPage', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('lists all server categories without truncating to a fixed count and selects the last one', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.endsWith('/ledgers')) return Response.json({ data: [{ id: 'l', role: 'owner', name: '账本' }] })
      if (url.endsWith('/categories')) return Response.json({ data: Array.from({length:23},(_,i)=>({id:`cat-${i}`,name:`分类${i}`,kind:'expense',icon:'📦',color:'#123456',version:1,sort_order:i})) })
      return Response.json({data:[]})
    })
    const router=createRouter({history:createMemoryHistory(),routes:[{path:'/entry',component:EntryPage},{path:'/accounts',component:{template:'<div />'}}]})
    await router.push('/entry');await router.isReady()
    const wrapper=mount(EntryPage,{global:{plugins:[router]}});await flushPromises()
    expect(wrapper.findAll('[data-category]')).toHaveLength(23)
    await wrapper.findAll('[data-category]')[22].trigger('click')
    expect(wrapper.get('.chosen').text()).toContain('分类22')
    wrapper.unmount()
  })
})
