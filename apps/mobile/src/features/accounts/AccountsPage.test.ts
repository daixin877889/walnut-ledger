import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { expect, it } from 'vitest'
import AccountsPage from './AccountsPage.vue'
it('renders the asset overview', async () => { const html=await renderToString(createSSRApp(AccountsPage)); expect(html).toContain('净资产'); expect(html).toContain('我的账户') })
