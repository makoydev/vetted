import * as github from '@actions/github'

export interface PullRequestContext {
  owner: string
  repo: string
  number: number
  action?: string
  headSha: string
  baseSha: string
  labels: string[]
  /** The label that triggered a `labeled` event, if any. */
  eventLabel?: string
  /** True when the head branch lives in another repository (a fork). */
  isFork: boolean
  runId: number
  runAttempt: number
}

export type EventContext =
  | { kind: 'pull_request'; pr: PullRequestContext }
  | { kind: 'unsupported'; eventName: string }

type GitHubContext = Pick<
  typeof github.context,
  'eventName' | 'payload' | 'repo' | 'runId'
>

/**
 * Reads the pull request from the workflow event. Only `pull_request` is
 * supported: `pull_request_target` runs with secrets and write access in the
 * context of untrusted fork code, so it is rejected (ADR 0007).
 */
export function readEventContext(
  context: GitHubContext = github.context,
  env: NodeJS.ProcessEnv = process.env
): EventContext {
  const pr = context.payload.pull_request
  if (context.eventName !== 'pull_request' || pr === undefined) {
    return { kind: 'unsupported', eventName: context.eventName }
  }

  const baseRepo: string | undefined = pr.base?.repo?.full_name
  const headRepo: string | undefined = pr.head?.repo?.full_name
  const labels: string[] = (pr.labels ?? []).map(
    (label: { name: string }) => label.name
  )

  return {
    kind: 'pull_request',
    pr: {
      owner: context.repo.owner,
      repo: context.repo.repo,
      number: pr.number,
      action: context.payload.action,
      headSha: pr.head.sha,
      baseSha: pr.base.sha,
      labels,
      eventLabel: context.payload.label?.name,
      // A deleted fork has no head repository; treat it as a fork.
      isFork: headRepo === undefined || headRepo !== baseRepo,
      runId: context.runId,
      runAttempt: Number(env.GITHUB_RUN_ATTEMPT ?? '1')
    }
  }
}
