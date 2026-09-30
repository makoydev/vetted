import { readEventContext } from '../src/context.js'

function pullRequestEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventName: 'pull_request',
    repo: { owner: 'octo', repo: 'app' },
    runId: 42,
    payload: {
      action: 'opened',
      pull_request: {
        number: 7,
        head: { sha: 'head-sha', repo: { full_name: 'octo/app' } },
        base: { sha: 'base-sha', repo: { full_name: 'octo/app' } },
        labels: [{ name: 'ai-review' }]
      },
      ...overrides
    }
  }
}

describe('readEventContext', () => {
  it('reads a same-repository pull request', () => {
    const event = readEventContext(pullRequestEvent(), {
      GITHUB_RUN_ATTEMPT: '2'
    })
    expect(event).toEqual({
      kind: 'pull_request',
      pr: {
        owner: 'octo',
        repo: 'app',
        number: 7,
        action: 'opened',
        headSha: 'head-sha',
        baseSha: 'base-sha',
        labels: ['ai-review'],
        eventLabel: undefined,
        isFork: false,
        runId: 42,
        runAttempt: 2
      }
    })
  })

  it('detects a fork', () => {
    const context = pullRequestEvent()
    context.payload.pull_request.head.repo.full_name = 'someone/app'
    const event = readEventContext(context, {})
    expect(event.kind === 'pull_request' && event.pr.isFork).toBe(true)
  })

  it('treats a deleted fork (no head repository) as a fork', () => {
    const context = pullRequestEvent()
    ;(context.payload.pull_request.head as { repo?: unknown }).repo = undefined
    const event = readEventContext(context, {})
    expect(event.kind === 'pull_request' && event.pr.isFork).toBe(true)
  })

  it.each(['pull_request_target', 'push', 'issue_comment'])(
    'refuses %s events',
    (eventName) => {
      expect(
        readEventContext({ ...pullRequestEvent(), eventName }, {})
      ).toEqual({
        kind: 'unsupported',
        eventName
      })
    }
  )
})
