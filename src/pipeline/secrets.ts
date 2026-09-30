import { RE2JS } from 're2js'
import vendored from '../../vendor/gitleaks/rules.json' with { type: 'json' }
import type { Scrubber } from './index.js'
import type { Span } from './redact.js'

// Applies gitleaks' default rules (v8.30.1, vendored) with an RE2 engine.
// All regexes here run on untrusted diff text, so RE2's linear-time matching
// matters: a crafted diff cannot make a pattern backtrack for minutes.
//
// Deliberate differences from gitleaks (ADR 0010), each tested:
//  D1 Inline `gitleaks:allow` comments are ignored: a diff can't exempt itself.
//  D2 Each allowlist regex is tested on its own. gitleaks joins them into one
//     pattern, which spreads a leading (?i) to the regexes after it.
//  D3 The global regex `(?i)^true|false|null$` is corrected to what it means;
//     as written it allowlists any secret that merely contains "false".
//  D4 The whole match is redacted, not only the part gitleaks calls the
//     secret (for some rules that is 5 characters of a 204-character URL).
//  D5 Allowlists never trust file paths: they only look at the text.
// Not implemented: base64/hex/percent decoding (the entropy check catches
// long encoded blobs), commit allowlists, and composite rules (unused).

interface AllowlistSpec {
  condition: 'OR' | 'AND' | string
  regexTarget: 'secret' | 'match' | 'line' | string
  regexes: string[]
  stopwords: string[]
  paths: string[]
}

interface RuleSpec {
  id: string
  regex: string | null
  path: string | null
  secretGroup: number
  entropy: number
  keywords: string[]
  allowlists: AllowlistSpec[]
}

/** D3: known-wrong upstream regexes and what they were meant to say. */
export const CORRECTED_REGEXES: Record<string, string> = {
  '(?i)^true|false|null$': '(?i)^(?:true|false|null)$'
}

interface Allowlist {
  condition: 'OR' | 'AND'
  target: 'secret' | 'match' | 'line'
  regexes: RE2JS[]
  stopwords: string[]
  hasPaths: boolean
}

interface Rule {
  id: string
  regex: RE2JS
  path: RE2JS | null
  secretGroup: number
  entropy: number
  keywords: string[]
  allowlists: Allowlist[]
}

function compileAllowlist(spec: AllowlistSpec): Allowlist {
  return {
    condition: spec.condition === 'AND' ? 'AND' : 'OR',
    target:
      spec.regexTarget === 'match' || spec.regexTarget === 'line'
        ? spec.regexTarget
        : 'secret',
    regexes: spec.regexes.map((r) => RE2JS.compile(CORRECTED_REGEXES[r] ?? r)),
    stopwords: spec.stopwords,
    hasPaths: spec.paths.length > 0
  }
}

function compileRules(specs: RuleSpec[]): Rule[] {
  return (
    specs
      // Path-only rules flag whole files; the path deny list covers them.
      .filter((spec) => spec.regex !== null)
      .map((spec) => ({
        id: spec.id,
        regex: RE2JS.compile(spec.regex!),
        path: spec.path === null ? null : RE2JS.compile(spec.path),
        secretGroup: spec.secretGroup,
        entropy: spec.entropy,
        keywords: spec.keywords,
        allowlists: spec.allowlists.map(compileAllowlist)
      }))
  )
}

const RULES = compileRules(vendored.rules as RuleSpec[])
const GLOBAL_ALLOWLISTS = (vendored.globalAllowlists as AllowlistSpec[]).map(
  compileAllowlist
)

/** Number of gitleaks rules applied to text. */
export const RULE_COUNT = RULES.length

/**
 * Shannon entropy exactly as gitleaks computes it: characters are counted
 * as code points but divided by the UTF-8 byte length.
 */
export function shannonEntropy(value: string): number {
  if (value === '') return 0
  const counts = new Map<string, number>()
  for (const ch of value) counts.set(ch, (counts.get(ch) ?? 0) + 1)
  const length = Buffer.byteLength(value, 'utf8')
  let entropy = 0
  for (const count of counts.values()) {
    const p = count / length
    entropy -= p * Math.log2(p)
  }
  return entropy
}

const found = (regex: RE2JS, text: string) =>
  text !== '' && regex.matcher(text).find()

/** gitleaks: re-run the regex on the match; take the chosen or first non-empty group. */
function extractSecret(rule: Rule, match: string): string {
  const m = rule.regex.matcher(match)
  if (!m.find()) return match
  if (rule.secretGroup > 0) return m.group(rule.secretGroup) ?? ''
  for (let g = 1; g <= m.groupCount(); g++) {
    const value = m.group(g)
    if (value) return value
  }
  return match
}

function isAllowlisted(
  list: Allowlist,
  finding: { secret: string; match: string; line: string }
): boolean {
  const target = finding[list.target]
  const regexHit = list.regexes.some((r) => found(r, target)) // D2
  const secret = finding.secret.toLowerCase()
  const stopwordHit = list.stopwords.some((w) => secret.includes(w))
  if (list.condition === 'OR') return regexHit || stopwordHit
  // AND: every defined check must pass. Path checks never pass (D5).
  if (list.hasPaths) return false
  return (
    (list.regexes.length === 0 || regexHit) &&
    (list.stopwords.length === 0 || stopwordHit) &&
    list.regexes.length + list.stopwords.length > 0
  )
}

function lineAround(text: string, start: number, end: number): string {
  const from = text.lastIndexOf('\n', start - 1) + 1
  const to = text.indexOf('\n', end)
  return text.slice(from, to === -1 ? text.length : to)
}

/** Finds secrets with gitleaks' rules, minus the deviations listed above. */
export function findSecrets(text: string, path: string): Span[] {
  const lower = text.toLowerCase()
  const spans: Span[] = []

  for (const rule of RULES) {
    if (rule.path && !found(rule.path, path)) continue
    if (
      rule.keywords.length > 0 &&
      !rule.keywords.some((k) => lower.includes(k))
    ) {
      continue
    }
    const matcher = rule.regex.matcher(text)
    while (matcher.find()) {
      let start = matcher.start()
      let end = matcher.end()
      while (start < end && text[start] === '\n') start++
      while (end > start && text[end - 1] === '\n') end--
      if (start === end) continue

      const match = text.slice(start, end)
      const secret = extractSecret(rule, match)
      if (rule.entropy > 0 && shannonEntropy(secret) <= rule.entropy) continue
      // D1: no check for inline "gitleaks:allow" markers.
      const finding = { secret, match, line: lineAround(text, start, end) }
      if (
        GLOBAL_ALLOWLISTS.some((a) => isAllowlisted(a, finding)) ||
        rule.allowlists.some((a) => isAllowlisted(a, finding))
      ) {
        continue
      }
      spans.push({ start, end, label: `SECRET:${rule.id}` }) // D4
    }
  }
  return spans
}

export const secretScrubber: Scrubber = { kind: 'secrets', find: findSecrets }
