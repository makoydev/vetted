import * as core from '@actions/core'
import { getOctokit } from '@actions/github'
import { newAuditRecord, type AuditRecord } from './audit.js'
import { renderReview } from './comments.js'
import { ConfigError, loadConfig, type VettedConfig } from './config.js'
import {
  readEventContext,
  type EventContext,
  type PullRequestContext
} from './context.js'
import { parseModelOutput, placeFindings } from './findings.js'
import { decide, parseMode, type GateDecision } from './gate.js'
import { createGitHubApi, type GitHubApi } from './github.js'
import { detectInjection } from './injection.js'
import { checkBudget, type BudgetCheck } from './model/budget.js'
import {
  ModelError,
  type ModelClient,
  type ModelResult
} from './model/client.js'
import { MockModel } from './model/mock.js'
import { OpenAIModel } from './model/openai.js'
import { ceilingUsd, costUsd } from './model/pricing.js'
import {
  buildPrompt,
  PROMPT_OVERHEAD_BYTES,
  providerSchema
} from './model/prompt.js'
import { entropyScrubber } from './pipeline/entropy.js'
import { runPipeline, type Scrubber } from './pipeline/index.js'
import { PII_RULES_VERSION, piiScrubber } from './pipeline/pii.js'
import { GITLEAKS_VERSION, secretScrubber } from './pipeline/secrets.js'
import { publishAudit } from './publish.js'

/** Everything `run` needs from the outside world, so tests can replace it. */
export interface RunDependencies {
  readContext: () => EventContext
  createApi: (token: string, owner: string, repo: string) => GitHubApi
  scrubbers: Scrubber[]
  createModel: (apiKey: string) => ModelClient
  createMock: () => ModelClient
  now: () => Date
  publishAudit: (record: AuditRecord) => Promise<void>
}

export const defaultDependencies: RunDependencies = {
  readContext: () => readEventContext(),
  createApi: (token, owner, repo) =>
    createGitHubApi(getOctokit(token), owner, repo),
  // Order doesn't change the result: overlapping findings are merged.
  scrubbers: [secretScrubber, entropyScrubber, piiScrubber],
  createModel: (apiKey) => new OpenAIModel(apiKey),
  createMock: () => new MockModel(),
  now: () => new Date(),
  publishAudit
}

interface ModelChoice {
  client: ModelClient
  reason: string
  budget?: BudgetCheck
}

/**
 * Picks the paid model only when the gate allows it, the model has a known
 * price, and today's worst-case spend stays within the budget. Anything
 * uncertain falls back to the free mock (ADR 0011).
 */
async function chooseModel(
  gate: GateDecision,
  config: VettedConfig,
  apiKey: string,
  pr: PullRequestContext,
  api: GitHubApi,
  deps: RunDependencies
): Promise<ModelChoice> {
  const mock = (reason: string, budget?: BudgetCheck): ModelChoice => ({
    client: deps.createMock(),
    reason,
    budget
  })
  if (!gate.useRealModel) return mock('Mock model: see the gate decision.')

  const ceiling = ceilingUsd(
    config.model,
    config.maxDiffBytes + PROMPT_OVERHEAD_BYTES,
    config.maxOutputTokens
  )
  if (ceiling === undefined) {
    return mock(
      `Mock model: no known price for "${config.model}", so its cost can't be bounded.`
    )
  }

  const midnight = deps.now().toISOString().slice(0, 10) + 'T00:00:00Z'
  let paidRunsToday: number
  try {
    paidRunsToday = await api.countWorkflowRunsSince(
      pr.runId,
      midnight,
      Math.floor(config.dailyBudgetUsd / ceiling) + 1
    )
  } catch {
    return mock(
      "Mock model: couldn't count today's runs (does the workflow grant `actions: read`?)."
    )
  }
  const budget = checkBudget({
    dailyBudgetUsd: config.dailyBudgetUsd,
    ceilingUsd: ceiling,
    paidRunsToday
  })
  if (!budget.allowed) return mock(budget.reason, budget)
  return { client: deps.createModel(apiKey), reason: budget.reason, budget }
}

/**
 * The main function for the action. Orchestration only; logic lives in
 * modules. Every run, including skipped and failed ones, ends with an audit
 * record.
 */
export async function run(
  deps: RunDependencies = defaultDependencies
): Promise<void> {
  const started = deps.now()
  const audit = newAuditRecord(started, {
    gitleaks: GITLEAKS_VERSION,
    sgPiiRules: PII_RULES_VERSION
  })
  const note = (reason: string) => {
    audit.reasons.push(reason)
    core.info(reason)
  }

  try {
    const mode = parseMode(core.getInput('mode'))
    audit.mode = mode
    const token = core.getInput('github-token')
    const apiKey = core.getInput('openai-api-key')
    if (apiKey) core.setSecret(apiKey)
    const configPath = core.getInput('config-path') || '.vetted.yml'
    core.setOutput('mode', mode)

    const event = deps.readContext()
    if (event.kind === 'unsupported') {
      audit.decision = 'skipped'
      note(
        `Vetted only runs on pull_request events, not "${event.eventName}". Nothing to do.`
      )
      return
    }
    const pr = event.pr
    Object.assign(audit.run, {
      repository: `${pr.owner}/${pr.repo}`,
      pullRequest: pr.number,
      headSha: pr.headSha,
      baseSha: pr.baseSha,
      runId: pr.runId,
      runAttempt: pr.runAttempt,
      action: pr.action ?? null
    })
    const api = deps.createApi(token, pr.owner, pr.repo)

    const { config, source, sha256 } = await loadConfig(
      api,
      configPath,
      pr.baseSha
    )
    audit.config = { source, sha256 }
    core.info(`Config: ${source}`)

    const gate = decide({
      mode,
      action: pr.action,
      labels: pr.labels,
      eventLabel: pr.eventLabel,
      reviewLabel: config.reviewLabel,
      isFork: pr.isFork,
      hasApiKey: apiKey !== ''
    })
    note(gate.reason)
    if (!gate.run) {
      audit.decision = 'skipped'
      return
    }

    const changed = await api.listChangedFiles(pr.number)
    const { files, report } = runPipeline(changed, config, deps.scrubbers)
    audit.scrub = report
    // Counts only: never log file content or anything that was scrubbed.
    core.info(
      `Pull request #${pr.number}: ${report.filesInPullRequest} changed files, ` +
        `${report.filesSent} to send (${report.bytesSent} bytes), ` +
        `${report.filesSkipped.length} skipped.`
    )
    core.setOutput('files-considered', report.filesInPullRequest)
    core.setOutput('files-sent', report.filesSent)
    if (files.length === 0) {
      audit.decision = 'nothing-to-send'
      return
    }

    const prompt = buildPrompt(files, report, pr)
    audit.prompt = { sha256: prompt.sha256, bytes: prompt.bytes }
    core.setOutput('prompt-sha256', prompt.sha256)
    const choice = await chooseModel(gate, config, apiKey, pr, api, deps)
    note(choice.reason)
    if (choice.budget) {
      audit.budget = {
        dailyBudgetUsd: config.dailyBudgetUsd,
        ceilingUsd: Number(choice.budget.ceilingUsd.toFixed(6)),
        paidRunsToday: choice.budget.paidRunsToday,
        maxPaidRunsPerDay: choice.budget.maxPaidRunsPerDay,
        allowed: choice.budget.allowed
      }
    }

    const requested = choice.client.provider === 'mock' ? 'mock' : config.model
    let result: ModelResult | null = null
    let modelProblem = ''
    try {
      result = await choice.client.complete({
        model: requested,
        instructions: prompt.instructions,
        input: prompt.input,
        schema: providerSchema(),
        maxOutputTokens: config.maxOutputTokens,
        reasoningEffort: config.reasoningEffort
      })
    } catch (error) {
      if (!(error instanceof ModelError)) throw error
      modelProblem = error.message
      core.warning(`${error.message}. No AI findings will be posted.`)
    }

    const usage = result?.usage ?? {
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0
    }
    const cost =
      result === null || choice.client.provider === 'mock'
        ? 0
        : costUsd(config.model, usage)
    audit.model = {
      provider: choice.client.provider,
      requested,
      returned: result?.model ?? null,
      reasoningEffort: config.reasoningEffort,
      status: result?.status ?? 'error',
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      reasoningTokens: usage.reasoningTokens,
      costUsd: Number(cost.toFixed(6))
    }
    audit.latencyMs.model = result?.latencyMs ?? null
    core.setOutput('cost-usd', cost.toFixed(6))
    if (result !== null) {
      core.info(
        `Model ${result.model}: ${result.status}, ${usage.inputTokens} input / ` +
          `${usage.outputTokens} output tokens, about US$${cost.toFixed(4)}, ` +
          `${result.latencyMs} ms.`
      )
    }

    // Model output is untrusted: it must match the schema or none of it is used.
    const parsed =
      result === null
        ? {
            ok: false as const,
            reason: `the model call failed (${modelProblem})`
          }
        : result.status !== 'completed'
          ? {
              ok: false as const,
              reason: `the model's answer was ${result.status} (${result.detail ?? 'no detail'})`
            }
          : parseModelOutput(result.text)
    if (!parsed.ok) core.warning(`AI findings discarded: ${parsed.reason}.`)
    const placed = parsed.ok
      ? placeFindings(parsed.findings, files)
      : { inline: [], general: [] }
    // Rule-based, so reported even when the model's output is unusable: an
    // attacker who breaks the model's output must not also hide the attempt.
    const injection = detectInjection(files)
    audit.findings = {
      valid: parsed.ok,
      invalidReason: parsed.ok ? null : parsed.reason.slice(0, 400),
      items: [
        ...placed.inline.map((f) => ({
          ...pick(f),
          placed: 'inline' as const
        })),
        ...placed.general.map((f) => ({
          ...pick(f),
          placed: 'general' as const
        }))
      ]
    }
    audit.injection = injection.map(({ rule, path, line }) => ({
      rule,
      path,
      line
    }))
    core.info(
      `Findings: ${placed.inline.length} on diff lines, ${placed.general.length} elsewhere, ` +
        `${injection.length} possible prompt injection(s).`
    )

    audit.decision =
      result === null
        ? 'model-error'
        : result.status !== 'completed'
          ? `model-${result.status}`
          : parsed.ok
            ? 'reviewed'
            : 'invalid-output'

    // Shadow mode never posts. A mock review only posts if a rule found something.
    const hasSomethingToSay =
      injection.length > 0 || (parsed.ok && choice.client.provider !== 'mock')
    if (gate.postComments && hasSomethingToSay) {
      const review = renderReview({
        summary: parsed.ok ? parsed.summary : null,
        unavailableReason: parsed.ok ? undefined : parsed.reason,
        inline: placed.inline,
        general: placed.general,
        injection,
        report,
        disclosure: {
          model: result?.model ?? config.model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          costUsd: cost,
          report
        }
      })
      audit.posting.attempted = true
      try {
        await api.postCommentReview(
          pr.number,
          pr.headSha,
          review.body,
          review.comments
        )
        audit.posting.commentsPosted = review.comments.length
        core.info(
          `Posted an advisory review with ${review.comments.length} comment(s).`
        )
      } catch (error) {
        audit.posting.error = (error as Error).message.slice(0, 400)
        core.warning(`Could not post the review: ${(error as Error).message}`)
      }
    }
    core.setOutput('findings', audit.findings.items.length)
    core.setOutput('injection-findings', injection.length)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    audit.decision = error instanceof ConfigError ? 'config-error' : 'error'
    audit.reasons.push(message.slice(0, 400))
    core.setFailed(
      error instanceof ConfigError
        ? `Configuration error, nothing was sent: ${message}`
        : message
    )
  } finally {
    const finished = deps.now()
    audit.run.finishedAt = finished.toISOString()
    audit.latencyMs.total = finished.getTime() - started.getTime()
    core.setOutput('comments-posted', audit.posting.commentsPosted)
    core.setOutput('decision', audit.decision)
    try {
      await deps.publishAudit(audit)
    } catch (error) {
      core.warning(
        `Could not publish the audit record: ${(error as Error).message}`
      )
    }
  }
}

/** Finding metadata for the audit: no titles or rationales, which may quote code. */
function pick(f: {
  path: string
  line: number
  severity: string
  confidence: string
  category: string
}) {
  return {
    path: f.path,
    line: f.line,
    severity: f.severity,
    confidence: f.confidence,
    category: f.category
  }
}
