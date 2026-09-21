import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { expect, it } from 'vitest'
import AccountsPage from './AccountsPage.vue'
import { createMemoryHistory, createRouter } from 'vue-router'
it('renders the asset overview', async () => { const router=createRouter({history:createMemoryHistory(),routes:[{path:'/entry',component:AccountsPage}]});await router.push('/entry');await router.isReady();const html=await renderToString(createSSRApp(AccountsPage).use(router)); expect(html).toContain('净资产'); expect(html).toContain('我的账户') })
