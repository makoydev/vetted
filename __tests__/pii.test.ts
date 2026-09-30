import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  detectPii,
  PII_RULES_VERSION,
  piiScrubber
} from '../src/pipeline/pii.js'

const vendorDir = join(import.meta.dirname, '..', 'vendor', 'sg-pii-rules')

interface FixtureFile {
  entity: string
  cases: {
    id: string
    kind: string
    text: string
    expect: { entity: string; value: string }[]
  }[]
}
const fixtureFiles: [string, FixtureFile][] = readdirSync(
  join(vendorDir, 'fixtures')
)
  .sort()
  .map((name) => [
    name,
    JSON.parse(readFileSync(join(vendorDir, 'fixtures', name), 'utf8'))
  ])

describe('vendored sg-pii-rules', () => {
  it('match the release SHA256SUMS, so a hand edit fails CI', () => {
    const sums = readFileSync(join(vendorDir, 'SHA256SUMS'), 'utf8')
    for (const line of sums.trim().split('\n')) {
      const [hash, file] = line.split(/\s+/)
      const actual = createHash('sha256')
        .update(readFileSync(join(vendorDir, file)))
        .digest('hex')
      expect(`${file} ${actual}`).toBe(`${file} ${hash}`)
    }
  })

  it('are version 0.1.0', () => {
    expect(PII_RULES_VERSION).toBe('0.1.0')
  })
})

// The conformance suite: every case must produce exactly its expected
// matches (sg-pii-rules SPEC.md §5).
describe.each(fixtureFiles)('conformance: %s', (_, file) => {
  it.each(file.cases.map((c) => [c.id, c] as const))('%s', (_, c) => {
    expect(
      detectPii(c.text).map(({ entity, value }) => ({ entity, value }))
    ).toEqual(c.expect)
  })
})

describe('piiScrubber', () => {
  it('labels spans with the entity, so the model sees <NRIC>, <PHONE> and so on', () => {
    const text = 'Call +65 9123 4567 or write to jo.an@example.com'
    const labels = piiScrubber.find(text, 'a.ts').map((s) => s.label)
    expect(labels).toEqual(['PHONE', 'EMAIL'])
  })
})
