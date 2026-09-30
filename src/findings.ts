import { Ajv } from 'ajv'
import type { PreparedFile } from './pipeline/index.js'
import findingsSchema from './schema/findings.schema.json' with { type: 'json' }

export type Severity = 'high' | 'medium' | 'low'

export interface Finding {
  path: string
  line: number
  severity: Severity
  confidence: Severity
  category: string
  title: string
  rationale: string
}

export type ParsedOutput =
  | { ok: true; summary: string; findings: Finding[] }
  | { ok: false; reason: string }

const validate = new Ajv({ allErrors: true }).compile<{
  summary: string
  findings: Finding[]
}>(findingsSchema)

/**
 * Model output is untrusted (OWASP LLM05:2025). It must be JSON matching the
 * full findings schema, lengths included, or nothing from it is posted.
 */
export function parseModelOutput(text: string | null): ParsedOutput {
  if (text === null) return { ok: false, reason: 'the model returned no text' }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'the model output is not valid JSON' }
  }
  if (!validate(data)) {
    const problems = (validate.errors ?? [])
      .slice(0, 5)
      .map((e) => `${e.instancePath || '/'} ${e.message}`)
      .join('; ')
    return {
      ok: false,
      reason: `the model output does not match the schema: ${problems}`
    }
  }
  return { ok: true, summary: data.summary, findings: data.findings }
}

const RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 }

export interface PlacedFindings {
  /** Findings on a line GitHub will accept a comment on. */
  inline: Finding[]
  /** Findings whose file or line isn't in the diff; shown in the review body. */
  general: Finding[]
}

/**
 * Checks each finding against the lines actually in the diff. GitHub
 * rejects a whole review if one comment points outside it, and a model can
 * name a line or file that isn't there.
 */
export function placeFindings(
  findings: Finding[],
  files: PreparedFile[]
): PlacedFindings {
  const byPath = new Map(files.map((f) => [f.path, f.commentable]))
  const sorted = [...findings].sort(
    (a, b) =>
      RANK[a.severity] - RANK[b.severity] ||
      RANK[a.confidence] - RANK[b.confidence]
  )
  const inline: Finding[] = []
  const general: Finding[] = []
  for (const finding of sorted) {
    if (byPath.get(finding.path)?.has(finding.line)) inline.push(finding)
    else general.push(finding)
  }
  return { inline, general }
}
