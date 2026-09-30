import { createHash } from 'node:crypto'
import { Ajv } from 'ajv'
import { parse } from 'yaml'
import type { GitHubApi } from './github.js'
import configSchema from './schema/config.schema.json' with { type: 'json' }

export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high'

export interface VettedConfig {
  model: string
  reasoningEffort: ReasoningEffort
  dailyBudgetUsd: number
  maxOutputTokens: number
  maxFiles: number
  maxDiffChars: number
  reviewLabel: string
  paths: { allow: string[]; deny: string[] }
}

/** Defaults are chosen to keep a busy repository well under US$10 a month. */
export const DEFAULT_CONFIG: VettedConfig = {
  model: 'gpt-6-luna',
  reasoningEffort: 'low',
  dailyBudgetUsd: 0.2,
  maxOutputTokens: 8000,
  maxFiles: 50,
  maxDiffChars: 60000,
  reviewLabel: 'ai-review',
  paths: { allow: [], deny: [] }
}

export class ConfigError extends Error {}

interface FileConfig {
  version?: 1
  model?: string
  reasoning_effort?: ReasoningEffort
  daily_budget_usd?: number
  max_output_tokens?: number
  limits?: { max_files?: number; max_diff_chars?: number }
  paths?: { allow?: string[]; deny?: string[] }
  review_label?: string
}

const validate = new Ajv({ allErrors: true }).compile<FileConfig>(configSchema)

/**
 * Parses and validates `.vetted.yml`. An invalid file is an error, never a
 * silent fallback to defaults: a typo must not quietly change what is sent.
 */
export function parseConfig(text: string | null): VettedConfig {
  if (text === null || text.trim() === '')
    return structuredClone(DEFAULT_CONFIG)

  let raw: unknown
  try {
    raw = parse(text)
  } catch (error) {
    throw new ConfigError(
      `.vetted.yml is not valid YAML: ${(error as Error).message}`
    )
  }
  raw ??= {}
  if (!validate(raw)) {
    const problems = (validate.errors ?? [])
      .map((e) => `${e.instancePath || '/'} ${e.message}`)
      .join('; ')
    throw new ConfigError(`.vetted.yml is invalid: ${problems}`)
  }

  return {
    model: raw.model ?? DEFAULT_CONFIG.model,
    reasoningEffort: raw.reasoning_effort ?? DEFAULT_CONFIG.reasoningEffort,
    dailyBudgetUsd: raw.daily_budget_usd ?? DEFAULT_CONFIG.dailyBudgetUsd,
    maxOutputTokens: raw.max_output_tokens ?? DEFAULT_CONFIG.maxOutputTokens,
    maxFiles: raw.limits?.max_files ?? DEFAULT_CONFIG.maxFiles,
    maxDiffChars: raw.limits?.max_diff_chars ?? DEFAULT_CONFIG.maxDiffChars,
    reviewLabel: raw.review_label ?? DEFAULT_CONFIG.reviewLabel,
    paths: {
      allow: raw.paths?.allow ?? [],
      deny: raw.paths?.deny ?? []
    }
  }
}

export interface LoadedConfig {
  config: VettedConfig
  /** Where the config came from, for the audit record. */
  source: string
  /** SHA-256 of the file's text, or null when defaults were used. */
  sha256: string | null
}

/**
 * Loads the config from the pull request's BASE commit (ADR 0007). A pull
 * request that edits `.vetted.yml` only changes the reviews of pull requests
 * opened after it is merged.
 */
export async function loadConfig(
  api: Pick<GitHubApi, 'getFileText'>,
  path: string,
  baseSha: string
): Promise<LoadedConfig> {
  const text = await api.getFileText(path, baseSha)
  return {
    config: parseConfig(text),
    source: text === null ? 'defaults' : `${path}@${baseSha}`,
    sha256:
      text === null ? null : createHash('sha256').update(text).digest('hex')
  }
}
