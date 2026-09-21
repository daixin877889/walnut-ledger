import { describe, expect, it } from 'vitest'
import { parseMoneyInput } from './money'

describe('parseMoneyInput', () => {
  it('将 12.34 转为 1234 分', () => {
    expect(parseMoneyInput('12.34')).toBe(1234)
  })

  it.each(['0', '-1', '1.001', '90071992547409.92', 'abc'])('拒绝 %s', (value) => {
    expect(() => parseMoneyInput(value)).toThrow('INVALID_MONEY')
  })
})
