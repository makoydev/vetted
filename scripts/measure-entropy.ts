// Calibrates the entropy check (src/pipeline/entropy.ts). Prints, for each
// threshold, the share of random secrets caught and the false-positive rate
// on real third-party code in node_modules. Prints no token values.
// Run with: npm run measure:entropy
import { randomInt } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function entropy(s: string): number {
  const counts = new Map<string, number>()
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1)
  const n = Buffer.byteLength(s)
  let h = 0
  for (const c of counts.values()) h -= (c / n) * Math.log2(c / n)
  return h
}

const THRESHOLDS = [4.0, 4.2, 4.3, 4.4, 4.5, 4.6]
const ALPHABETS: Record<string, string> = {
  base64: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
  alphanumeric:
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
  'lower+digits': 'abcdefghijklmnopqrstuvwxyz0123456789'
}
// randomInt is unbiased; `byte % alphabet.length` would favour some
// characters whenever the alphabet size doesn't divide 256.
const random = (alphabet: string, n: number) =>
  Array.from({ length: n }, () => alphabet[randomInt(alphabet.length)]).join('')

console.log('Share of 2,000 random secrets caught, by threshold:')
for (const [name, alphabet] of Object.entries(ALPHABETS)) {
  for (const length of [32, 40, 64]) {
    const caught = THRESHOLDS.map((t) => {
      let k = 0
      for (let i = 0; i < 2000; i++)
        if (entropy(random(alphabet, length)) > t) k++
      return `>${t}: ${Math.round(k / 20)}%`
    })
    console.log(`  ${name} x${length}: ${caught.join('  ')}`)
  }
}

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* sources(path)
    else if (/\.(c|m)?[jt]s$/.test(name) && !/\.(min\.js|d\.ts)$/.test(name))
      yield path
  }
}
const TOKEN = /[A-Za-z0-9+/=_-]{32,}/g
const hits = THRESHOLDS.map(() => 0)
let bytes = 0
for (const path of sources(join(import.meta.dirname, '..', 'node_modules'))) {
  const text = readFileSync(path, 'utf8')
  if (bytes + text.length > 30e6) break
  bytes += text.length
  for (const [token] of text.matchAll(TOKEN)) {
    const h = entropy(token)
    THRESHOLDS.forEach((t, i) => {
      if (h > t) hits[i]++
    })
  }
}
const mb = bytes / 1048576
console.log(`False positives on ${mb.toFixed(1)} MB of real third-party code:`)
console.log(
  '  ' +
    THRESHOLDS.map((t, i) => `>${t}: ${(hits[i] / mb).toFixed(1)}/MB`).join(
      '  '
    )
)
