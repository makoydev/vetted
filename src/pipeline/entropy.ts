import { RE2JS } from 're2js'
import type { Scrubber } from './index.js'
import type { Span } from './redact.js'
import { shannonEntropy } from './secrets.js'

// A backstop for secrets no gitleaks rule names: long runs of base64-style
// characters whose Shannon entropy is high. Hex strings (commit SHAs,
// checksums) can't exceed 4.0 bits per character, so they never match.
//
// Calibrated with `npm run measure:entropy` (EVALS.md): at 4.3 and 32+
// characters, 96-97% of random 32-character base64/alphanumeric secrets
// and 100% of 40+ character ones are caught, at about 15 false positives
// per MB of real JavaScript (mostly inline base64 source maps).
export const MIN_LENGTH = 32
export const ENTROPY_THRESHOLD = 4.3

const CANDIDATE = RE2JS.compile(`[A-Za-z0-9+/=_-]{${MIN_LENGTH},}`)

export function findHighEntropy(text: string): Span[] {
  const spans: Span[] = []
  const matcher = CANDIDATE.matcher(text)
  while (matcher.find()) {
    const token = matcher.group() ?? ''
    if (shannonEntropy(token) > ENTROPY_THRESHOLD) {
      spans.push({
        start: matcher.start(),
        end: matcher.end(),
        label: 'SECRET:high-entropy'
      })
    }
  }
  return spans
}

export const entropyScrubber: Scrubber = {
  kind: 'secrets',
  find: (text) => findHighEntropy(text)
}
