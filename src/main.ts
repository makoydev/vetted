import * as core from '@actions/core'
import { getOctokit } from '@actions/github'
import { ConfigError, loadConfig } from './config.js'
import { readEventContext, type EventContext } from './context.js'
import { decide, parseMode } from './gate.js'
import { createGitHubApi, type GitHubApi } from './github.js'
import { entropyScrubber } from './pipeline/entropy.js'
import { runPipeline, type Scrubber } from './pipeline/index.js'
import { piiScrubber } from './pipeline/pii.js'
import { secretScrubber } from './pipeline/secrets.js'

/** Everything `run` needs from the outside world, so tests can replace it. */
export interface RunDependencies {
  readContext: () => EventContext
  createApi: (token: string, owner: string, repo: string) => GitHubApi
  scrubbers: Scrubber[]
}

export const defaultDependencies: RunDependencies = {
  readContext: () => readEventContext(),
  createApi: (token, owner, repo) =>
    createGitHubApi(getOctokit(token), owner, repo),
  // Order doesn't change the result: overlapping findings are merged.
  scrubbers: [secretScrubber, entropyScrubber, piiScrubber]
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
    const { report } = runPipeline(changed, config, deps.scrubbers)
    // Counts only: never log file content or anything that was scrubbed.
    core.info(
      `Pull request #${pr.number}: ${report.filesInPullRequest} changed files, ` +
        `${report.filesSent} to send (${report.charsSent} characters), ` +
        `${report.filesSkipped.length} skipped.`
    )
    core.setOutput('files-considered', report.filesInPullRequest)
    core.setOutput('files-sent', report.filesSent)
    core.setOutput('decision', 'reviewed')
  } catch (error) {
    if (error instanceof ConfigError) {
      core.setFailed(`Configuration error, nothing was sent: ${error.message}`)
    } else if (error instanceof Error) {
      core.setFailed(error.message)
    }
  }
}
