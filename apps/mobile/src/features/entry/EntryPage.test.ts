import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import EntryPage from './EntryPage.vue'

describe('EntryPage', () => {
  it('shows every category and the complete custom keypad', async () => {
    const html = await renderToString(createSSRApp(EntryPage))
    expect((html.match(/data-category/g) ?? [])).toHaveLength(20)
    expect(html).toContain('aria-label="退格"')
    expect(html).toContain('保存并继续记一笔')
    expect(html).toContain('class="category-panel"')
    expect(html).toContain('class="entry-console"')
    expect(html).not.toContain('onclick=')
  })
})
