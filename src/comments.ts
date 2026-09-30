import type { Finding } from './findings.js'
import type { InjectionFinding } from './injection.js'
import type { ScrubReport } from './pipeline/index.js'
import { VERSION } from './version.js'

export interface ReviewComment {
  path: string
  line: number
  side: 'RIGHT'
  body: string
}

export interface Review {
  body: string
  comments: ReviewComment[]
}

/**
 * Model text is untrusted output (OWASP LLM05:2025). Before posting:
 * images and links are removed (a markdown image URL is a known channel for
 * leaking data out of an AI system), HTML is escaped, and @mentions are
 * defused so the model can't notify people.
 */
export function sanitize(text: string): string {
  return (
    text
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '[image removed]')
      .replace(/\[([^\]]*)\]\((?:https?:)?\/\/[^)]*\)/g, '$1 [link removed]')
      // Escape rather than strip tags: stripping can be bypassed by nesting
      // (`<scr<script>ipt>`), escaping can't.
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\bhttps?:\/\/\S+/gi, '[link removed]')
      .replace(/@(?=[A-Za-z0-9-])/g, '@​')
  )
}

const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const FEEDBACK =
  '<sub>Advisory only: a human decides. React 👍 or 👎, or add the `ai-false-positive` label to report a wrong finding.</sub>'

function renderFinding(f: Finding): string {
  return [
    `**[AI] ${label(f.severity)} severity · ${f.confidence} confidence · ${f.category}**`,
    `**${sanitize(f.title)}**`,
    '',
    sanitize(f.rationale),
    '',
    FEEDBACK
  ].join('\n')
}

function renderInjection(f: InjectionFinding): string {
  const excerpt = f.excerpt.replace(/`/g, "'")
  return [
    `**[Vetted] Possible prompt injection · \`${f.rule}\`**`,
    `**${f.title}**`,
    '',
    `This added line contains \`${excerpt}\`. Text like this can steer an AI reviewer. Vetted did not follow it and left it in the diff, so a human can decide whether it belongs here. This finding comes from a fixed rule, not from the AI model.`,
    '',
    FEEDBACK
  ].join('\n')
}

export interface Disclosure {
  model: string
  inputTokens: number
  outputTokens: number
  costUsd: number
  report: ScrubReport
}

/** The footer on every review: what produced it, what it cost, what was hidden. */
export function footer(d: Disclosure): string {
  const secrets = Object.values(d.report.secrets).reduce((a, b) => a + b, 0)
  const pii = Object.values(d.report.pii).reduce((a, b) => a + b, 0)
  return (
    `<sub>🤖 [AI] Advisory review by Vetted v${VERSION} · model \`${d.model}\` · ` +
    `${d.inputTokens.toLocaleString('en-US')} input / ${d.outputTokens.toLocaleString('en-US')} output tokens · ` +
    `est. US$${d.costUsd.toFixed(4)} · redacted before sending: ${secrets} secret(s), ${pii} personal-data value(s) · ` +
    `Vetted never approves, requests changes or merges. [About](https://github.com/makoydev/vetted)</sub>`
  )
}

export function renderReview(input: {
  summary: string | null
  unavailableReason?: string
  inline: Finding[]
  general: Finding[]
  injection: InjectionFinding[]
  report: ScrubReport
  disclosure: Disclosure
}): Review {
  const comments: ReviewComment[] = [
    ...input.injection.map((f) => ({
      path: f.path,
      line: f.line,
      side: 'RIGHT' as const,
      body: renderInjection(f)
    })),
    ...input.inline.map((f) => ({
      path: f.path,
      line: f.line,
      side: 'RIGHT' as const,
      body: renderFinding(f)
    }))
  ]

  const parts = ['### Vetted review (advisory)', '']
  if (input.summary !== null) {
    parts.push(sanitize(input.summary), '')
  } else {
    parts.push(
      `AI review unavailable: ${input.unavailableReason ?? 'no output'}. Only rule-based findings are shown.`,
      ''
    )
  }
  parts.push(
    `- ${input.inline.length} AI finding(s) on lines of the diff, ${input.general.length} below, ${input.injection.length} possible prompt injection(s).`
  )
  if (input.report.filesSkipped.length > 0) {
    const skipped = input.report.filesSkipped
      .slice(0, 20)
      .map((s) => `\`${s.path}\` (${s.reason})`)
      .join(', ')
    const more =
      input.report.filesSkipped.length > 20
        ? `, and ${input.report.filesSkipped.length - 20} more`
        : ''
    parts.push(`- Not sent for review: ${skipped}${more}.`)
  }
  if (input.general.length > 0) {
    parts.push(
      '',
      '<details><summary>Findings that could not be placed on a line of the diff</summary>',
      ''
    )
    for (const f of input.general) {
      parts.push(
        `**[AI] ${label(f.severity)} · ${f.confidence} confidence · \`${sanitize(f.path)}\` line ${f.line}: ${sanitize(f.title)}**`,
        '',
        sanitize(f.rationale),
        ''
      )
    }
    parts.push('</details>')
  }
  parts.push('', '---', footer(input.disclosure))
  return { body: parts.join('\n'), comments }
}
