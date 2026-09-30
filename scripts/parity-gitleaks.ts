// Compares Vetted's secret scrubber with the real gitleaks binary (same
// version, v8.30.1) on the same files. Prints rule IDs and counts only,
// never secret values.
//
// Usage:
//   node scripts/parity-gitleaks.ts <strings.json>        one test case per string
//   node scripts/parity-gitleaks.ts <directory> [MB]       real source files (default 10 MB)
// Needs `gitleaks` on PATH (brew install gitleaks). Decoding is turned off in
// gitleaks, because Vetted does not decode (ADR 0010).
import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { findSecrets } from '../src/pipeline/secrets.ts'

const [input, megabytes = '10'] = process.argv.slice(2)
if (!input)
  throw new Error('usage: parity-gitleaks.ts <strings.json | directory> [MB]')

const work = mkdtempSync(join(tmpdir(), 'vetted-parity-'))
const cases: { name: string; text: string }[] = []

if (input.endsWith('.json')) {
  const strings = JSON.parse(readFileSync(input, 'utf8')) as string[]
  strings.forEach((text, i) =>
    cases.push({ name: `case-${String(i).padStart(5, '0')}.txt`, text })
  )
} else {
  let budget = Number(megabytes) * 1024 * 1024
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      if (budget <= 0) return
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (/\.(c|m)?[jt]s$/.test(name) && !name.endsWith('.d.ts')) {
        const text = readFileSync(path, 'utf8')
        budget -= text.length
        // Neutral names: gitleaks skips paths such as node_modules/.
        cases.push({
          name: `case-${String(cases.length).padStart(5, '0')}${extname(name)}`,
          text
        })
      }
    }
  }
  walk(input)
}
for (const c of cases) writeFileSync(join(work, c.name), c.text)

const reportPath = join(work, '..', `${work.split('/').pop()}-report.json`)
execFileSync(
  'gitleaks',
  [
    'dir',
    work,
    '--report-format',
    'json',
    '--report-path',
    reportPath,
    '--no-banner',
    '--no-color',
    '--max-decode-depth',
    '0',
    '--exit-code',
    '0',
    '--log-level',
    'error'
  ],
  { stdio: 'inherit' }
)
const report = JSON.parse(readFileSync(reportPath, 'utf8')) as {
  File: string
  RuleID: string
}[]
rmSync(reportPath)
rmSync(work, { recursive: true })

type Counts = Map<string, Map<string, number>>
const add = (counts: Counts, file: string, rule: string) => {
  const perFile = counts.get(file) ?? new Map<string, number>()
  perFile.set(rule, (perFile.get(rule) ?? 0) + 1)
  counts.set(file, perFile)
}
const theirs: Counts = new Map()
for (const f of report) add(theirs, f.File.split('/').pop()!, f.RuleID)
const ours: Counts = new Map()
for (const c of cases) {
  for (const span of findSecrets(c.text, c.name))
    add(ours, c.name, span.label.replace(/^SECRET:/, ''))
}

let agree = 0
const onlyGitleaks = new Map<string, number>()
const onlyVetted = new Map<string, number>()
const inlineAllow = { onlyVetted: 0 }
for (const c of cases) {
  const t = theirs.get(c.name) ?? new Map()
  const o = ours.get(c.name) ?? new Map()
  let same = true
  for (const rule of new Set([...t.keys(), ...o.keys()])) {
    const diff = (t.get(rule) ?? 0) - (o.get(rule) ?? 0)
    if (diff > 0) onlyGitleaks.set(rule, (onlyGitleaks.get(rule) ?? 0) + diff)
    if (diff < 0) {
      onlyVetted.set(rule, (onlyVetted.get(rule) ?? 0) - diff)
      if (c.text.includes('gitleaks:allow')) inlineAllow.onlyVetted -= diff
    }
    if (diff !== 0) same = false
  }
  if (same) agree++
}

const total = (counts: Counts) =>
  [...counts.values()].reduce(
    (s, m) => s + [...m.values()].reduce((a, b) => a + b, 0),
    0
  )
console.log(
  JSON.stringify(
    {
      cases: cases.length,
      findings: { gitleaks: total(theirs), vetted: total(ours) },
      casesInFullAgreement: agree,
      foundByGitleaksOnly: Object.fromEntries(
        [...onlyGitleaks].sort((a, b) => b[1] - a[1])
      ),
      foundByVettedOnly: Object.fromEntries(
        [...onlyVetted].sort((a, b) => b[1] - a[1])
      ),
      vettedOnlyOnLinesWithGitleaksAllow: inlineAllow.onlyVetted
    },
    null,
    2
  )
)
