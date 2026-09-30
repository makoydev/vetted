import { fakeGitHubApi } from '../__fixtures__/github-api.js'
import {
  ConfigError,
  DEFAULT_CONFIG,
  loadConfig,
  parseConfig
} from '../src/config.js'

describe('parseConfig', () => {
  it('uses defaults when there is no file', () => {
    expect(parseConfig(null)).toEqual(DEFAULT_CONFIG)
    expect(parseConfig('   ')).toEqual(DEFAULT_CONFIG)
  })

  it('reads every setting', () => {
    const config = parseConfig(`
version: 1
model: gpt-5-nano
reasoning_effort: none
daily_budget_usd: 0.5
max_output_tokens: 4000
limits:
  max_files: 10
  max_diff_chars: 20000
paths:
  allow: ['src/**']
  deny: ['docs/**']
review_label: ai
`)
    expect(config).toEqual({
      model: 'gpt-5-nano',
      reasoningEffort: 'none',
      dailyBudgetUsd: 0.5,
      maxOutputTokens: 4000,
      maxFiles: 10,
      maxDiffChars: 20000,
      reviewLabel: 'ai',
      paths: { allow: ['src/**'], deny: ['docs/**'] }
    })
  })

  it.each([
    ['an unknown key', 'modle: gpt-6-luna'],
    ['a budget above the cap', 'daily_budget_usd: 50'],
    ['too many output tokens', 'max_output_tokens: 1000000'],
    ['a malformed model name', 'model: "GPT 6; rm -rf /"'],
    ['an unknown reasoning effort', 'reasoning_effort: extreme'],
    ['a wrong version', 'version: 2']
  ])('rejects %s instead of silently using defaults', (_, text) => {
    expect(() => parseConfig(text)).toThrow(ConfigError)
  })

  it('rejects invalid YAML', () => {
    expect(() => parseConfig('paths: [unclosed')).toThrow(/not valid YAML/)
  })
})

describe('loadConfig', () => {
  it('reads the config from the base commit, never the head', async () => {
    const api = fakeGitHubApi([], {
      '.vetted.yml@base-sha': 'daily_budget_usd: 0.1',
      '.vetted.yml@head-sha': 'daily_budget_usd: 5'
    })

    const loaded = await loadConfig(api, '.vetted.yml', 'base-sha')

    expect(api.getFileText).toHaveBeenCalledWith('.vetted.yml', 'base-sha')
    expect(api.getFileText).not.toHaveBeenCalledWith(
      expect.anything(),
      'head-sha'
    )
    expect(loaded.config.dailyBudgetUsd).toBe(0.1)
    expect(loaded.source).toBe('.vetted.yml@base-sha')
    expect(loaded.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('falls back to defaults only when the file does not exist', async () => {
    const loaded = await loadConfig(fakeGitHubApi(), '.vetted.yml', 'base-sha')
    expect(loaded).toEqual({
      config: DEFAULT_CONFIG,
      source: 'defaults',
      sha256: null
    })
  })
})
