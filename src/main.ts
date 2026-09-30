import * as core from '@actions/core'
import { getOctokit } from '@actions/github'
import { renderReview } from './comments.js'
import { ConfigError, loadConfig, type VettedConfig } from './config.js'
import {
  readEventContext,
  type EventContext,
  type PullRequestContext
} from './context.js'
import { decide, parseMode, type GateDecision } from './gate.js'
import { parseModelOutput, placeFindings } from './findings.js'
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
import { piiScrubber } from './pipeline/pii.js'
import { secretScrubber } from './pipeline/secrets.js'

/** Everything `run` needs from the outside world, so tests can replace it. */
export interface RunDependencies {
  readContext: () => EventContext
  createApi: (token: string, owner: string, repo: string) => GitHubApi
  scrubbers: Scrubber[]
  createModel: (apiKey: string) => ModelClient
  createMock: () => ModelClient
  now: () => Date
}

export const defaultDependencies: RunDependencies = {
  readContext: () => readEventContext(),
  createApi: (token, owner, repo) =>
    createGitHubApi(getOctokit(token), owner, repo),
  // Order doesn't change the result: overlapping findings are merged.
  scrubbers: [secretScrubber, entropyScrubber, piiScrubber],
  createModel: (apiKey) => new OpenAIModel(apiKey),
  createMock: () => new MockModel(),
  now: () => new Date()
}

interface ModelChoice {
  client: ModelClient
  reason: string
  budget?: BudgetCheck
}

/**
 * Picks the paid model only when the gate allows it, the model has a known
 * price, and today's worst-case spend stays within the budget. Anything
 * uncertain falls back to the free mock.
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
  if (!gate.useRealModel)
    return mock('Mock model: see the gate decision above.')

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

/** The main function for the action. Orchestration only; logic lives in modules. */
export async function run(
  deps: RunDependencies = defaultDependencies
): Promise<void> {
  try {
    const mode = parseMode(core.getInput('mode'))
    const token = core.getInput('github-token')
    const apiKey = core.getInput('openai-api-key')
    if (apiKey) core.setSecret(apiKey)
    const configPath = core.getInput('config-path') || '.vetted.yml'
    core.setOutput('mode', mode)

    const event = deps.readContext()
    if (event.kind === 'unsupported') {
      core.info(
        `Vetted only runs on pull_request events, not "${event.eventName}". Nothing to do.`
      )
      core.setOutput('decision', 'skipped')
      return
    }
    const pr = event.pr
    const api = deps.createApi(token, pr.owner, pr.repo)

    const { config, source } = await loadConfig(api, configPath, pr.baseSha)
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
    core.info(gate.reason)
    if (!gate.run) {
      core.setOutput('decision', 'skipped')
      return
    }

    const changed = await api.listChangedFiles(pr.number)
    const { files, report } = runPipeline(changed, config, deps.scrubbers)
    // Counts only: never log file content or anything that was scrubbed.
    core.info(
      `Pull request #${pr.number}: ${report.filesInPullRequest} changed files, ` +
        `${report.filesSent} to send (${report.bytesSent} bytes), ` +
        `${report.filesSkipped.length} skipped.`
    )
    core.setOutput('files-considered', report.filesInPullRequest)
    core.setOutput('files-sent', report.filesSent)
    if (files.length === 0) {
      core.setOutput('decision', 'nothing-to-send')
      return
    }

    const prompt = buildPrompt(files, report, pr)
    const choice = await chooseModel(gate, config, apiKey, pr, api, deps)
    core.info(choice.reason)

    let result: ModelResult | null = null
    let modelProblem = ''
    try {
      result = await choice.client.complete({
        model: choice.client.provider === 'mock' ? 'mock' : config.model,
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
    core.info(
      `Findings: ${placed.inline.length} on diff lines, ${placed.general.length} elsewhere, ` +
        `${injection.length} possible prompt injection(s).`
    )

    const decision =
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
    let commentsPosted = 0
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
      try {
        await api.postCommentReview(
          pr.number,
          pr.headSha,
          review.body,
          review.comments
        )
        commentsPosted = review.comments.length
        core.info(
          `Posted an advisory review with ${commentsPosted} comment(s).`
        )
      } catch (error) {
        core.warning(`Could not post the review: ${(error as Error).message}`)
      }
    }

    core.setOutput('prompt-sha256', prompt.sha256)
    core.setOutput('cost-usd', cost.toFixed(6))
    core.setOutput('findings', placed.inline.length + placed.general.length)
    core.setOutput('injection-findings', injection.length)
    core.setOutput('comments-posted', commentsPosted)
    core.setOutput('decision', decision)
  } catch (error) {
    if (error instanceof ConfigError) {
      core.setFailed(`Configuration error, nothing was sent: ${error.message}`)
    } else if (error instanceof Error) {
      core.setFailed(error.message)
    }
  }
}
