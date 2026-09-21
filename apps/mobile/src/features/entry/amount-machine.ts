export type AmountState = { display: string; storedCents: number | null; operator: '+' | '-' | null; waitingOperand?: boolean }
export const initialAmountState = (): AmountState => ({ display: '0', storedCents: null, operator: null })
export const MAX_AMOUNT_CENTS = 99_999_999_999

function cents(value: string) {
  const negative = value.startsWith('-')
  const [whole, fraction = ''] = value.replace(/^-/, '').split('.')
  return (Number(whole) * 100 + Number(fraction.padEnd(2, '0'))) * (negative ? -1 : 1)
}

export function amountCents(state: AmountState): number {
  const value = cents(state.display)
  if (state.storedCents === null || !state.operator || state.waitingOperand) return state.storedCents ?? value
  return state.operator === '+' ? state.storedCents + value : state.storedCents - value
}

export function reduceAmount(state: AmountState, key: string): AmountState {
  if (key === 'backspace') return { ...state, waitingOperand: false, display: state.display.length > 1 ? state.display.slice(0, -1).replace(/^-$/, '0') : '0' }
  if (key === '+' || key === '-') {
    const result = amountCents(state)
    if (!Number.isSafeInteger(result) || Math.abs(result) > MAX_AMOUNT_CENTS) return state
    return { display: '0', storedCents: result, operator: key, waitingOperand: true }
  }
  if (key === '=') {
    const result = amountCents(state)
    if (!Number.isSafeInteger(result) || Math.abs(result) > MAX_AMOUNT_CENTS) return state
    return { display: (result / 100).toFixed(2), storedCents: null, operator: null }
  }
  if (!/^\d$/.test(key) && key !== '.') return state
  const display = state.waitingOperand ? '0' : state.display
  if (key === '.' && display.includes('.')) return state
  const next = display === '0' && key !== '.' ? key : display + key
  if ((next.split('.')[1]?.length ?? 0) > 2 || Math.abs(cents(next)) > MAX_AMOUNT_CENTS) return state
  return { ...state, display: next, waitingOperand: false }
}
