/**
 * Tests for src/main.ts. `@actions/core` is replaced by __fixtures__/core.ts
 * and the GitHub API by an in-memory fake, so nothing touches the network.
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'
import { fakeGitHubApi } from '../__fixtures__/github-api.js'
import type { EventContext, PullRequestContext } from '../src/context.js'

jest.unstable_mockModule('@actions/core', () => core)

const { run } = await import('../src/main.js')

const pr: PullRequestContext = {
  owner: 'octo',
  repo: 'app',
  number: 7,
  action: 'opened',
  headSha: 'head-sha',
  baseSha: 'base-sha',
  labels: [],
  isFork: false,
  runId: 1,
  runAttempt: 1
}

function inputs(values: Record<string, string>) {
  core.getInput.mockImplementation((name: string) => values[name] ?? '')
}

function deps(event: EventContext, api = fakeGitHubApi()) {
  return { readContext: () => event, createApi: () => api }
}

describe('run', () => {
  afterEach(() => {
    jest.resetAllMocks()
  })

  it('reviews every pull request in shadow mode, reading the diff through the API', async () => {
    inputs({ mode: 'shadow', 'github-token': 't' })
    const api = fakeGitHubApi([
      {
        path: 'a.ts',
        status: 'modified',
        additions: 1,
        deletions: 0,
        patch: '@@'
      }
    ])

    await run(deps({ kind: 'pull_request', pr }, api))

    expect(api.listChangedFiles).toHaveBeenCalledWith(7)
    expect(core.setOutput).toHaveBeenCalledWith('decision', 'reviewed')
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('skips an opt-in pull request without the label, without fetching the diff', async () => {
    inputs({ mode: 'opt-in', 'github-token': 't' })
    const api = fakeGitHubApi()

    await run(deps({ kind: 'pull_request', pr }, api))

    expect(api.listChangedFiles).not.toHaveBeenCalled()
    expect(core.setOutput).toHaveBeenCalledWith('decision', 'skipped')
  })

  it('does nothing on unsupported events', async () => {
    inputs({ mode: 'shadow' })

    await run(deps({ kind: 'unsupported', eventName: 'pull_request_target' }))

    expect(core.setOutput).toHaveBeenCalledWith('decision', 'skipped')
    expect(core.info).toHaveBeenCalledWith(
      expect.stringMatching(/only runs on pull_request/)
    )
  })

  it('masks the API key so it can never appear in logs', async () => {
    inputs({ mode: 'shadow', 'openai-api-key': 'key-value' })

    await run(deps({ kind: 'pull_request', pr }))

    expect(core.setSecret).toHaveBeenCalledWith('key-value')
  })

  it('fails closed on an invalid config, before fetching anything', async () => {
    inputs({ mode: 'shadow' })
    const api = fakeGitHubApi([], { '.vetted.yml@base-sha': 'modle: typo' })

    await run(deps({ kind: 'pull_request', pr }, api))

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringMatching(/Configuration error, nothing was sent/)
    )
    expect(api.listChangedFiles).not.toHaveBeenCalled()
  })

  it('fails the step on an unknown mode', async () => {
    inputs({ mode: 'default-on' })

    await run(deps({ kind: 'pull_request', pr }))

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringMatching(/Unknown mode "default-on"/)
    )
  })
})
