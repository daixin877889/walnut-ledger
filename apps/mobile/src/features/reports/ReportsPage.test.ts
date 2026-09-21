import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { expect, it } from 'vitest'
import ReportsPage from './ReportsPage.vue'
it('renders trend and category sections', async () => { const html=await renderToString(createSSRApp(ReportsPage)); expect(html).toContain('分类占比'); expect(html).toContain('本月支出') })
