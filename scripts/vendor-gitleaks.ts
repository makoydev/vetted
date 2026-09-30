// Converts the vendored gitleaks rule file (TOML) into JSON that Vetted
// bundles, and writes SHA256SUMS for the vendored files.
// Run with: npm run vendor:gitleaks
// It only reshapes the data: every regex, keyword and threshold is copied
// unchanged. Deviations from gitleaks' behaviour live in
// src/pipeline/secrets.ts, where they are documented and tested (ADR 0010).
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'smol-toml'

const dir = join(import.meta.dirname, '..', 'vendor', 'gitleaks')
const SOURCE = {
  repository: 'https://github.com/gitleaks/gitleaks',
  tag: 'v8.30.1',
  commit: '83d9cd684c87d95d656c1458ef04895a7f1cbd8e',
  file: 'config/gitleaks.toml',
  sha256: 'e163e53b9e7e8a8511e77271e2b323ed057759542a6d988258afe3a1fa329caf',
  licence: 'MIT, Copyright (c) 2019 Zachary Rice (see LICENSE)'
}

type Toml = Record<string, unknown>
const sha256 = (data: string | Buffer) =>
  createHash('sha256').update(data).digest('hex')

const raw = readFileSync(join(dir, 'gitleaks.toml'))
if (sha256(raw) !== SOURCE.sha256) {
  throw new Error('gitleaks.toml does not match the pinned release checksum')
}
const toml = parse(raw.toString('utf8')) as Toml

function allowlist(a: Toml) {
  const condition = String(a.condition ?? 'OR').toUpperCase()
  return {
    description: (a.description as string) ?? '',
    condition: condition === 'AND' || condition === '&&' ? 'AND' : 'OR',
    regexTarget: (a.regexTarget as string) ?? 'secret',
    regexes: (a.regexes as string[]) ?? [],
    stopwords: ((a.stopwords as string[]) ?? []).map((s) => s.toLowerCase()),
    paths: (a.paths as string[]) ?? [],
    commits: (a.commits as string[]) ?? []
  }
}

const globalAllowlists = [
  ...(toml.allowlist ? [toml.allowlist as Toml] : []),
  ...((toml.allowlists as Toml[]) ?? [])
].map(allowlist)

const rules = (toml.rules as Toml[]).map((r) => {
  if (r.required || r.skipReport) {
    throw new Error(
      `Rule ${r.id} uses composite rules, which Vetted does not implement`
    )
  }
  return {
    id: r.id as string,
    description: (r.description as string) ?? '',
    regex: (r.regex as string) ?? null,
    path: (r.path as string) ?? null,
    secretGroup: (r.secretGroup as number) ?? 0,
    entropy: (r.entropy as number) ?? 0,
    keywords: ((r.keywords as string[]) ?? []).map((k) => k.toLowerCase()),
    allowlists: [
      ...(r.allowlist ? [r.allowlist as Toml] : []),
      ...((r.allowlists as Toml[]) ?? [])
    ].map(allowlist)
  }
})

const json =
  JSON.stringify({ source: SOURCE, globalAllowlists, rules }, null, 2) + '\n'
writeFileSync(join(dir, 'rules.json'), json)

const sums = ['LICENSE', 'gitleaks.toml', 'rules.json']
  .map((f) => `${sha256(readFileSync(join(dir, f)))}  ${f}\n`)
  .join('')
writeFileSync(join(dir, 'SHA256SUMS'), sums)
console.log(`wrote rules.json (${rules.length} rules) and SHA256SUMS`)
