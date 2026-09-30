/**
 * Tests for src/main.ts. `@actions/core` is replaced by __fixtures__/core.ts,
 * the GitHub API by an in-memory fake, and every model by a MockModel, so
 * nothing touches the network or a paid API.
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'
import { fakeGitHubApi } from '../__fixtures__/github-api.js'
import type { EventContext, PullRequestContext } from '../src/context.js'
import type { ChangedFile } from '../src/github.js'
import { ModelError } from '../src/model/client.js'
import { MockModel } from '../src/model/mock.js'

jest.unstable_mockModule('@actions/core', () => core)

const { run } = await import('../src/main.js')
const { secretScrubber } = await import('../src/pipeline/secrets.js')

const pr: PullRequestContext = {
  owner: 'octo',
  repo: 'app',
  number: 7,
  action: 'opened',
  headSha: 'head-sha',
  baseSha: 'base-sha',
  labels: [],
  isFork: false,
  runId: 99,
  runAttempt: 1
}

const changed: ChangedFile[] = [
  {
    path: 'src/a.ts',
    status: 'modified',
    additions: 1,
    deletions: 0,
    patch: '@@ -1 +1 @@\n+const a = 1'
  }
]

function inputs(values: Record<string, string>) {
  core.getInput.mockImplementation((name: string) => values[name] ?? '')
}

function setup(
  options: { event?: EventContext; api?: ReturnType<typeof fakeGitHubApi> } = {}
) {
  const api = options.api ?? fakeGitHubApi(changed)
  const mock = new MockModel()
  const paid = new MockModel()
  const createModel = jest.fn(() => ({
    ...paid,
    provider: 'openai' as const,
    complete: paid.complete.bind(paid)
  }))
  const deps = {
    readContext: () => options.event ?? { kind: 'pull_request' as const, pr },
    createApi: () => api,
    scrubbers: [secretScrubber],
    createModel,
    createMock: () => mock,
    now: () => new Date('2026-09-30T10:00:00Z')
  }
  return { api, mock, paid, createModel, deps }
}

const output = (name: string) =>
  core.setOutput.mock.calls
    .filter(([n]) => n === name)
    .map(([, v]) => v)
    .at(-1)

describe('run', () => {
  afterEach(() => {
    jest.resetAllMocks()
  })

  it('in shadow mode without a key, sends the scrubbed diff to the mock only', async () => {
    inputs({ mode: 'shadow' })
    const { api, mock, createModel, deps } = setup()

    await run(deps)

    expect(api.listChangedFiles).toHaveBeenCalledWith(7)
    expect(createModel).not.toHaveBeenCalled()
    expect(mock.requests).toHaveLength(1)
    expect(mock.requests[0].input).toContain('+const a = 1')
    expect(output('decision')).toBe('reviewed')
    expect(output('cost-usd')).toBe('0.000000')
  })

  it('calls the paid model when a key is set and the budget allows it', async () => {
    inputs({ mode: 'shadow', 'openai-api-key': 'k' })
    const { api, mock, createModel, deps } = setup({
      api: fakeGitHubApi(changed, {}, 3)
    })

    await run(deps)

    expect(api.countWorkflowRunsSince).toHaveBeenCalledWith(
      99,
      '2026-09-30T00:00:00Z',
      expect.any(Number)
    )
    expect(createModel).toHaveBeenCalledWith('k')
    expect(mock.requests).toHaveLength(0)
    expect(core.info).toHaveBeenCalledWith(
      expect.stringMatching(/Budget: run 4 of at most \d+ today/)
    )
  })

  it('falls back to the mock once the daily worst case is used up', async () => {
    inputs({ mode: 'shadow', 'openai-api-key': 'k' })
    const { mock, createModel, deps } = setup({
      api: fakeGitHubApi(changed, {}, 1000)
    })

    await run(deps)

    expect(createModel).not.toHaveBeenCalled()
    expect(mock.requests).toHaveLength(1)
    expect(core.info).toHaveBeenCalledWith(expect.stringMatching(/daily limit/))
  })

  it("falls back to the mock when today's runs can't be counted", async () => {
    inputs({ mode: 'shadow', 'openai-api-key': 'k' })
    const api = fakeGitHubApi(changed)
    api.countWorkflowRunsSince.mockRejectedValue(new Error('403'))
    const { createModel, deps } = setup({ api })

    await run(deps)

    expect(createModel).not.toHaveBeenCalled()
    expect(core.info).toHaveBeenCalledWith(
      expect.stringMatching(/actions: read/)
    )
  })

  it('falls back to the mock for a model without a known price', async () => {
    inputs({ mode: 'shadow', 'openai-api-key': 'k' })
    const api = fakeGitHubApi(changed, {
      '.vetted.yml@base-sha': 'model: gpt-9-ultra'
    })
    const { createModel, deps } = setup({ api })

    await run(deps)

    expect(createModel).not.toHaveBeenCalled()
    expect(core.info).toHaveBeenCalledWith(
      expect.stringMatching(/no known price for "gpt-9-ultra"/)
    )
  })

  it('never calls the paid model for a fork, even with a key', async () => {
    inputs({ mode: 'shadow', 'openai-api-key': 'k' })
    const { createModel, deps } = setup({
      event: { kind: 'pull_request', pr: { ...pr, isFork: true } }
    })

    await run(deps)

    expect(createModel).not.toHaveBeenCalled()
  })

  it('does not call any model when every file was skipped', async () => {
    inputs({ mode: 'shadow' })
    const { mock, deps } = setup({
      api: fakeGitHubApi([
        {
          path: '.env',
          status: 'added',
          additions: 1,
          deletions: 0,
          patch: '+X=1'
        }
      ])
    })

    await run(deps)

    expect(mock.requests).toHaveLength(0)
    expect(output('decision')).toBe('nothing-to-send')
  })

  it('records a model error and posts nothing', async () => {
    inputs({ mode: 'shadow' })
    const { mock, deps } = setup()
    jest
      .spyOn(mock, 'complete')
      .mockRejectedValue(new ModelError('OpenAI API error 500'))

    await run(deps)

    expect(output('decision')).toBe('model-error')
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringMatching(/Nothing was posted/)
    )
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('skips an opt-in pull request without the label, without fetching the diff', async () => {
    inputs({ mode: 'opt-in' })
    const { api, deps } = setup()

    await run(deps)

    expect(api.listChangedFiles).not.toHaveBeenCalled()
    expect(output('decision')).toBe('skipped')
  })

  it('does nothing on unsupported events', async () => {
    inputs({ mode: 'shadow' })
    const { deps } = setup({
      event: { kind: 'unsupported', eventName: 'pull_request_target' }
    })

    await run(deps)

    expect(output('decision')).toBe('skipped')
  })

  it('masks the API key so it can never appear in logs', async () => {
    inputs({ mode: 'shadow', 'openai-api-key': 'key-value' })
    await run(setup().deps)
    expect(core.setSecret).toHaveBeenCalledWith('key-value')
  })

  it('fails closed on an invalid config, before fetching anything', async () => {
    inputs({ mode: 'shadow' })
    const api = fakeGitHubApi(changed, {
      '.vetted.yml@base-sha': 'modle: typo'
    })
    const { deps } = setup({ api })

    await run(deps)

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringMatching(/Configuration error, nothing was sent/)
    )
    expect(api.listChangedFiles).not.toHaveBeenCalled()
  })

  it('fails the step on an unknown mode', async () => {
    inputs({ mode: 'default-on' })
    await run(setup().deps)
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringMatching(/Unknown mode "default-on"/)
    )
  })
})
