import { RE2JS } from 're2js'
import rules from '../../vendor/sg-pii-rules/detectors.json' with { type: 'json' }
import type { Scrubber } from './index.js'
import type { Span } from './redact.js'

// Vetted's implementation of sg-pii-rules' SPEC.md (v0.1.0-rc.1, vendored).
// It must pass every case in vendor/sg-pii-rules/fixtures/, the same
// conformance suite Discreet's Go implementation will run.

interface DetectorSpec {
  id: string
  entity: string
  pattern: string
  validator?: string
}

// NRIC/FIN check letter (sg-pii-rules VALIDATORS.md). The algorithm was never
// officially published; it is community-derived and consistent across three
// independent implementations.
const WEIGHTS = [2, 7, 6, 5, 4, 3, 2]
const OFFSETS: Record<string, number> = { S: 0, T: 4, F: 0, G: 4, M: 3 }
const LETTERS: Record<string, string> = {
  S: 'JZIHGFEDCBA',
  T: 'JZIHGFEDCBA',
  F: 'XWUTRQPNMLK',
  G: 'XWUTRQPNMLK',
  M: 'XWUTRQPNJLK'
}
const NRIC_SHAPE = /^([STFGM])(\d{7})([A-Z])$/

function hasValidCheckLetter(value: string): boolean {
  const match = NRIC_SHAPE.exec(value.toUpperCase())
  if (match === null) return false
  const [, prefix, digits, letter] = match
  const sum = WEIGHTS.reduce(
    (total, weight, i) => total + weight * Number(digits[i]),
    OFFSETS[prefix]
  )
  return LETTERS[prefix][sum % 11] === letter
}

export const VALIDATORS: Record<string, (value: string) => boolean> = {
  sg_nric_fin_checksum: hasValidCheckLetter,
  sg_nric_fin_checksum_invalid: (value) =>
    NRIC_SHAPE.test(value.toUpperCase()) && !hasValidCheckLetter(value)
}

const DETECTORS = (rules.detectors as DetectorSpec[]).map((spec, order) => {
  if (spec.validator !== undefined && !(spec.validator in VALIDATORS)) {
    // SPEC.md §3: an unknown validator is a load error, never a silent pass.
    throw new Error(`Unknown validator ${spec.validator} in sg-pii-rules`)
  }
  return {
    entity: spec.entity,
    order,
    pattern: RE2JS.compile(spec.pattern),
    validate:
      spec.validator === undefined ? undefined : VALIDATORS[spec.validator]
  }
})

export interface PiiMatch {
  entity: string
  value: string
  start: number
  end: number
}

/** SPEC.md §4: match, validate, then resolve overlaps (longest, then file order). */
export function detectPii(text: string): PiiMatch[] {
  const candidates: (PiiMatch & { order: number })[] = []
  for (const detector of DETECTORS) {
    const matcher = detector.pattern.matcher(text)
    while (matcher.find()) {
      const value = matcher.group() ?? ''
      if (value === '' || (detector.validate && !detector.validate(value)))
        continue
      candidates.push({
        entity: detector.entity,
        value,
        start: matcher.start(),
        end: matcher.end(),
        order: detector.order
      })
    }
  }

  candidates.sort(
    (a, b) =>
      a.start - b.start ||
      b.end - b.start - (a.end - a.start) ||
      a.order - b.order
  )
  const kept: typeof candidates = []
  for (const candidate of candidates) {
    const last = kept.at(-1)
    if (last === undefined || candidate.start >= last.end) {
      kept.push(candidate)
    } else {
      const length = candidate.end - candidate.start
      const lastLength = last.end - last.start
      if (
        length > lastLength ||
        (length === lastLength && candidate.order < last.order)
      ) {
        kept[kept.length - 1] = candidate
      }
    }
  }
  return kept.map(({ entity, value, start, end }) => ({
    entity,
    value,
    start,
    end
  }))
}

export const piiScrubber: Scrubber = {
  kind: 'pii',
  find: (text): Span[] =>
    detectPii(text).map((m) => ({
      start: m.start,
      end: m.end,
      label: m.entity
    }))
}

/** The sg-pii-rules release this build uses, for the audit record. */
export const PII_RULES_VERSION = rules.version
