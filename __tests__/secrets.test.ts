import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fakeHighEntropyToken, fakeSecrets } from '../__fixtures__/canaries.js'
import { findHighEntropy } from '../src/pipeline/entropy.js'
import {
  CORRECTED_REGEXES,
  findSecrets,
  RULE_COUNT,
  shannonEntropy
} from '../src/pipeline/secrets.js'
import vendored from '../vendor/gitleaks/rules.json' with { type: 'json' }

const vendorDir = join(import.meta.dirname, '..', 'vendor', 'gitleaks')

function redact(text: string, spans: { start: number; end: number }[]) {
  let out = text
  for (const s of [...spans].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, s.start) + '<X>' + out.slice(s.end)
  }
  return out
}

describe('vendored gitleaks rules', () => {
  it('match SHA256SUMS, so a hand edit fails CI', () => {
    const sums = readFileSync(join(vendorDir, 'SHA256SUMS'), 'utf8')
    for (const line of sums.trim().split('\n')) {
      const [hash, file] = line.split(/\s+/)
      const actual = createHash('sha256')
        .update(readFileSync(join(vendorDir, file)))
        .digest('hex')
      expect(`${file} ${actual}`).toBe(`${file} ${hash}`)
    }
  })

  it('are the pinned upstream release', () => {
    expect(vendored.source).toMatchObject({
      tag: 'v8.30.1',
      sha256: 'e163e53b9e7e8a8511e77271e2b323ed057759542a6d988258afe3a1fa329caf'
    })
  })

  it('all compile with RE2 (221 text rules; the one path-only rule is covered by the deny list)', () => {
    expect(RULE_COUNT).toBe(221)
  })
})

describe('findSecrets', () => {
  it.each(fakeSecrets().map((s) => [s.rule, s] as const))(
    'finds and fully redacts a runtime-generated %s',
    (rule, secret) => {
      const text = `+ ${secret.line}\n`
      const spans = findSecrets(text, 'src/config.ts')
      expect(spans.map((s) => s.label)).toContain(`SECRET:${rule}`)
      expect(redact(text, spans)).not.toContain(secret.value)
    }
  )

  it('finds nothing in ordinary code', () => {
    const code = [
      'export function add(a: number, b: number) { return a + b }',
      'const url = "https://example.com/docs/getting-started"',
      'const sha = "3d3c42e5aac5ba805825da76410c181273ba90b1"',
      'const apiVersion = 2',
      'password: ${{ secrets.DB_PASSWORD }}'
    ].join('\n')
    expect(findSecrets(code, 'src/a.ts')).toEqual([])
  })

  it('D1: ignores inline gitleaks:allow markers, so a diff cannot exempt itself', () => {
    const [secret] = fakeSecrets().filter((s) => s.rule === 'github-pat')
    const text = `${secret.line} // gitleaks:allow`
    expect(findSecrets(text, 'a.ts').map((s) => s.label)).toContain(
      'SECRET:github-pat'
    )
  })

  it('D3: the upstream regex that allowlists anything containing "false" is corrected', () => {
    const upstream = vendored.globalAllowlists.flatMap((a) => a.regexes)
    expect(upstream).toContain(Object.keys(CORRECTED_REGEXES)[0])
    const text = 'db_password = "Xq7falseMz9Kp2Lw4Nv8"'
    expect(findSecrets(text, 'a.ts').map((s) => s.label)).toContain(
      'SECRET:generic-api-key'
    )
  })

  it('D4: redacts the whole match, not only the part gitleaks calls the secret', () => {
    const [hook] = fakeSecrets().filter((s) => s.rule === 'slack-webhook-url')
    const spans = findSecrets(hook.line, 'a.ts')
    const redacted = redact(hook.line, spans)
    expect(redacted).not.toContain('hooks.slack.com')
  })

  it('applies path-restricted rules only to their file types', () => {
    const line = 'password = "Q7xk2Lm9Pz4Rt8Vn3Wc6"'
    const inTf = findSecrets(line, 'main.tf').map((s) => s.label)
    const inTs = findSecrets(line, 'main.ts').map((s) => s.label)
    expect(inTs).not.toContain('SECRET:hashicorp-tf-password')
    expect(inTf.length).toBeGreaterThan(0)
  })
})

describe('shannonEntropy', () => {
  it('matches gitleaks: code points counted, divided by UTF-8 bytes', () => {
    expect(shannonEntropy('')).toBe(0)
    expect(shannonEntropy('aaaa')).toBe(0)
    expect(shannonEntropy('ab')).toBe(1)
    expect(shannonEntropy('é')).toBeCloseTo(0.5)
  })
})

describe('findHighEntropy', () => {
  it('catches a random 40-character base64 token no rule names', () => {
    const token = fakeHighEntropyToken()
    const spans = findHighEntropy(`const blob = "${token}"`)
    expect(spans).toHaveLength(1)
    expect(spans[0].label).toBe('SECRET:high-entropy')
  })

  it.each([
    [
      'a 40-character hex commit SHA',
      '3d3c42e5aac5ba805825da76410c181273ba90b1'
    ],
    ['a UUID', '550e8400-e29b-41d4-a716-446655440000'],
    ['a long identifier', 'createPullRequestReviewCommentForGivenLine'],
    ['a repeated pattern', 'abcabcabcabcabcabcabcabcabcabcabcabc'],
    ['a short random token', 'Xq7Mz9Kp2Lw4Nv8'],
    [
      'a 64-character SHA-256',
      'e163e53b9e7e8a8511e77271e2b323ed057759542a6d988258afe3a1fa329caf'
    ]
  ])('ignores %s', (_, value) => {
    expect(findHighEntropy(`x = "${value}"`)).toEqual([])
  })
})
