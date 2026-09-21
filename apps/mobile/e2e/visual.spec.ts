import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { visualRoutes, visualViewports } from './visual-matrix'
import shellSource from '../src/ui/AppShell.vue?raw'
import entrySource from '../src/features/entry/EntryPage.vue?raw'
const tokensCss = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8')

describe('mobile visual matrix', () => {
  it('covers every confirmed core page', () => {
    expect(visualRoutes).toEqual(['/bills', '/entry', '/reports', '/accounts', '/me'])
  })
  it('covers standard and narrow phone viewports', () => {
    expect(visualViewports).toEqual([{ width: 390, height: 844 }, { width: 320, height: 700 }])
  })
  it('keeps navigation and keypad clear of phone safe areas', () => {
    expect(tokensCss).toContain('env(safe-area-inset-bottom')
    expect(shellSource).toContain('var(--safe-bottom)')
    expect(entrySource).toContain('padding-bottom:var(--safe-bottom)')
  })
  it('defines a narrow-screen category layout without horizontal overflow', () => {
    expect(entrySource).toContain('@media(max-width:340px)')
    expect(entrySource).toContain('grid-template-columns:repeat(5,minmax(0,1fr))')
  })
})
