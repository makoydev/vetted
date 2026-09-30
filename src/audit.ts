import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Ajv } from 'ajv'
import auditSchema from './schema/audit.schema.json' with { type: 'json' }
import { VERSION } from './version.js'

/**
 * One record per run, uploaded as a workflow artifact. It contains counts,
 * hashes and metadata only, never diff text, prompt text or model prose, so
 * it can be kept and shared as evidence without becoming a leak itself.
 */
export interface AuditRecord {
  schemaVersion: 1
  vettedVersion: string
  run: {
    repository: string | null
    pullRequest: number | null
    headSha: string | null
    baseSha: string | null
    runId: number | null
    runAttempt: number | null
    action: string | null
    startedAt: string
    finishedAt: string
  }
  mode: string | null
  decision: string
  reasons: string[]
  config: { source: string | null; sha256: string | null }
  rules: { gitleaks: string; sgPiiRules: string }
  prompt: { sha256: string; bytes: number } | null
  model: {
    provider: 'openai' | 'mock'
    requested: string
    returned: string | null
    reasoningEffort: string
    status: string
    inputTokens: number
    outputTokens: number
    reasoningTokens: number
    costUsd: number
  } | null
  budget: {
    dailyBudgetUsd: number
    ceilingUsd: number
    paidRunsToday: number
    maxPaidRunsPerDay: number
    allowed: boolean
  } | null
  scrub: {
    filesInPullRequest: number
    filesSent: number
    filesSkipped: { path: string; reason: string }[]
    bytesSent: number
    secrets: Record<string, number>
    pii: Record<string, number>
  } | null
  findings: {
    valid: boolean | null
    invalidReason: string | null
    items: {
      path: string
      line: number
      severity: string
      confidence: string
      category: string
      placed: 'inline' | 'general'
    }[]
  }
  injection: { rule: string; path: string; line: number }[]
  posting: { attempted: boolean; commentsPosted: number; error: string | null }
  latencyMs: { total: number; model: number | null }
}

export function newAuditRecord(
  startedAt: Date,
  rules: AuditRecord['rules']
): AuditRecord {
  return {
    schemaVersion: 1,
    vettedVersion: VERSION,
    run: {
      repository: null,
      pullRequest: null,
      headSha: null,
      baseSha: null,
      runId: null,
      runAttempt: null,
      action: null,
      startedAt: startedAt.toISOString(),
      finishedAt: startedAt.toISOString()
    },
    mode: null,
    decision: 'error',
    reasons: [],
    config: { source: null, sha256: null },
    rules,
    prompt: null,
    model: null,
    budget: null,
    scrub: null,
    findings: { valid: null, invalidReason: null, items: [] },
    injection: [],
    posting: { attempted: false, commentsPosted: 0, error: null },
    latencyMs: { total: 0, model: null }
  }
}

const validate = new Ajv({ allErrors: true }).compile<AuditRecord>(auditSchema)

/** Throws if a record doesn't match the audit schema. */
export function assertValidAudit(record: AuditRecord): void {
  if (!validate(record)) {
    const problems = (validate.errors ?? [])
      .slice(0, 5)
      .map((e) => `${e.instancePath || '/'} ${e.message}`)
      .join('; ')
    throw new Error(`Audit record does not match its schema: ${problems}`)
  }
}

/** Writes the record to a file named after the run, and returns its path. */
export function writeAuditFile(
  record: AuditRecord,
  dir = process.env.RUNNER_TEMP ?? tmpdir()
): string {
  assertValidAudit(record)
  const folder = join(dir, 'vetted-audit')
  mkdirSync(folder, { recursive: true })
  const name = `vetted-audit-${record.run.pullRequest ?? 'none'}-${record.run.runId ?? 'local'}-${record.run.runAttempt ?? 1}.json`
  const path = join(folder, name)
  writeFileSync(path, JSON.stringify(record, null, 2) + '\n')
  return path
}

/** A short, human-readable summary for the workflow run page. */
export function summaryMarkdown(record: AuditRecord): string {
  const sum = (counts: Record<string, number> | undefined) =>
    Object.values(counts ?? {}).reduce((a, b) => a + b, 0)
  const rows: [string, string][] = [
    ['Decision', `\`${record.decision}\``],
    ['Mode', record.mode ?? 'n/a'],
    [
      'Model',
      record.model
        ? `${record.model.returned ?? record.model.requested} (${record.model.provider})`
        : 'not called'
    ],
    [
      'Tokens (in / out)',
      record.model
        ? `${record.model.inputTokens} / ${record.model.outputTokens}`
        : 'n/a'
    ],
    [
      'Estimated cost',
      record.model ? `US$${record.model.costUsd.toFixed(4)}` : 'US$0'
    ],
    [
      'Files sent / in PR',
      record.scrub
        ? `${record.scrub.filesSent} / ${record.scrub.filesInPullRequest}`
        : 'n/a'
    ],
    ['Secrets redacted', String(sum(record.scrub?.secrets))],
    ['Personal data redacted', String(sum(record.scrub?.pii))],
    ['AI findings', String(record.findings.items.length)],
    ['Possible prompt injections', String(record.injection.length)],
    ['Comments posted', String(record.posting.commentsPosted)],
    [
      'Prompt SHA-256',
      record.prompt ? `\`${record.prompt.sha256.slice(0, 16)}…\`` : 'n/a'
    ]
  ]
  return [
    '### Vetted audit',
    '',
    '| | |',
    '|---|---|',
    ...rows.map(([k, v]) => `| ${k} | ${v} |`),
    '',
    ...record.reasons.map((r) => `- ${r}`)
  ].join('\n')
}
