import { RE2JS } from 're2js'
import type { PreparedFile } from './pipeline/index.js'

// Known prompt-injection patterns (OWASP LLM01:2025). Suspected injection
// text is never removed from the diff (ADR 0006): it stays, so the model's
// behaviour can be observed and a human sees what was attempted, and each
// hit is reported as a finding of its own. Patterns run on RE2, so a
// crafted diff can't slow them down.

interface InjectionRule {
  id: string
  severity: 'high' | 'medium' | 'low'
  title: string
  pattern: RE2JS
}

const rule = (
  id: string,
  severity: InjectionRule['severity'],
  title: string,
  pattern: string
): InjectionRule => ({ id, severity, title, pattern: RE2JS.compile(pattern) })

export const INJECTION_RULES: InjectionRule[] = [
  rule(
    'injection/override-instructions',
    'medium',
    'Text that tries to override an AI reviewer’s instructions',
    '(?i)\\b(?:ignore|disregard|forget|override|bypass)\\b.{0,40}?\\b(?:all|any|previous|prior|above|earlier|preceding|system|your)\\b.{0,20}?\\b(?:instructions?|prompts?|rules|directions|guidelines)\\b'
  ),
  rule(
    'injection/role-marker',
    'medium',
    'Chat-template or role markers that an AI model may treat as instructions',
    '(?i)(?:<\\|im_start\\|>|<\\|im_end\\|>|<\\|system\\|>|\\[/?INST\\]|<<SYS>>|</?system>|BEGIN SYSTEM PROMPT|^\\s*#{1,3}\\s*(?:system|assistant)\\s*:)'
  ),
  rule(
    'injection/reviewer-manipulation',
    'medium',
    'Text that asks an AI reviewer to approve or stay quiet',
    "(?i)(?:\\b(?:approve|accept|merge|lgtm)\\b.{0,40}?\\b(?:this|the)\\s+(?:pull request|pr|change|diff)\\b|\\b(?:do not|don't|never)\\s+(?:report|flag|mention|comment on)\\b|\\byou are (?:now )?(?:an?|the) (?:ai|assistant|reviewer|language model|llm)\\b)"
  ),
  rule(
    'injection/prompt-exfiltration',
    'medium',
    'Text that asks an AI model to reveal its instructions',
    '(?i)\\b(?:reveal|print|show|repeat|output|leak)\\b.{0,30}?\\b(?:system prompt|your instructions|hidden instructions|initial prompt)\\b'
  ),
  rule(
    'injection/hidden-characters',
    'high',
    'Invisible or bidirectional-control characters',
    // Zero-width and bidi controls ("Trojan Source") and Unicode tag
    // characters, which can hide instructions from a human reader.
    '[\\x{200B}-\\x{200F}\\x{202A}-\\x{202E}\\x{2060}-\\x{2064}\\x{2066}-\\x{2069}\\x{FEFF}\\x{E0000}-\\x{E007F}]'
  )
]

export interface InjectionFinding {
  rule: string
  severity: InjectionRule['severity']
  title: string
  path: string
  line: number
  /** A short, printable excerpt of the matched text, for the comment. */
  excerpt: string
}

/** Scans added lines of the files being sent. Context lines already existed. */
export function detectInjection(files: PreparedFile[]): InjectionFinding[] {
  const found: InjectionFinding[] = []
  for (const file of files) {
    for (const line of file.lines) {
      if (line.kind !== 'add' || line.newLine === undefined) continue
      for (const r of INJECTION_RULES) {
        const matcher = r.pattern.matcher(line.text)
        if (!matcher.find()) continue
        found.push({
          rule: r.id,
          severity: r.severity,
          title: r.title,
          path: file.path,
          line: line.newLine,
          excerpt: printable(matcher.group() ?? '')
        })
      }
    }
  }
  return found
}

/** Makes hidden characters visible as U+XXXX and keeps excerpts short. */
function printable(text: string): string {
  const shown = [...text]
    .map((ch) => {
      const code = ch.codePointAt(0)!
      return code < 0x20 ||
        (code >= 0x200b && code <= 0x206f) ||
        code === 0xfeff ||
        code >= 0xe0000
        ? `U+${code.toString(16).toUpperCase().padStart(4, '0')}`
        : ch
    })
    .join('')
  return shown.length > 80 ? shown.slice(0, 77) + '...' : shown
}
