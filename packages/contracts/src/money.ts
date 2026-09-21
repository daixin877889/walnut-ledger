const MONEY_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/

export function parseMoneyInput(value: string): number {
  if (!MONEY_PATTERN.test(value)) {
    throw new Error('INVALID_MONEY')
  }

  const [yuan, decimal = ''] = value.split('.')
  const cents = Number(yuan) * 100 + Number(decimal.padEnd(2, '0'))

  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new Error('INVALID_MONEY')
  }

  return cents
}
