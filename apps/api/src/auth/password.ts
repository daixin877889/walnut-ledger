const encoder = new TextEncoder()

function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function decode(value: string): Uint8Array {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
}

export async function derive(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const stableSalt = Uint8Array.from(salt)
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: stableSalt, iterations }, key, 256)
}

export async function hashPassword(password: string, iterations: number): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = new Uint8Array(await derive(password, salt, iterations))
  return `pbkdf2-sha256$${iterations}$${encode(salt)}$${encode(hash)}`
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, iterationText, saltText, expectedText] = encoded.split('$')
  if (algorithm !== 'pbkdf2-sha256' || !iterationText || !saltText || !expectedText) return false
  const iterations = Number(iterationText)
  if (!Number.isSafeInteger(iterations) || iterations <= 0) return false
  const actual = new Uint8Array(await derive(password, decode(saltText), iterations))
  const expected = decode(expectedText)
  if (actual.length !== expected.length) return false
  let difference = 0
  for (let index = 0; index < actual.length; index += 1) difference |= actual[index]! ^ expected[index]!
  return difference === 0
}
