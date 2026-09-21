import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { expect, it } from 'vitest'
import ProfilePage from './ProfilePage.vue'
it('renders account and data management sections', async () => { const html=await renderToString(createSSRApp(ProfilePage)); expect(html).toContain('同步与备份'); expect(html).toContain('账本管理') })
