import type { ReasoningEffort } from '../config.js'

export interface ModelRequest {
  model: string
  /** System instructions (trusted, written by Vetted). */
  instructions: string
  /** The prompt, with the scrubbed diff inside random delimiters. */
  input: string
  /** JSON Schema the provider should constrain its output to. */
  schema: Record<string, unknown>
  maxOutputTokens: number
  reasoningEffort: ReasoningEffort
}

export interface ModelUsage {
  inputTokens: number
  /** Includes reasoning tokens, which are billed as output. */
  outputTokens: number
  reasoningTokens: number
}

export interface ModelResult {
  /** The raw text the model returned; validated against the schema later. */
  text: string | null
  /** The model name the provider reports, for the disclosure footer. */
  model: string
  status: 'completed' | 'incomplete' | 'refused'
  /** Why the output is incomplete, or the refusal text. */
  detail?: string
  usage: ModelUsage
  latencyMs: number
}

/** Anything that can review a prompt. Tests only ever use the mock. */
export interface ModelClient {
  readonly provider: 'openai' | 'mock'
  complete(request: ModelRequest): Promise<ModelResult>
}

export class ModelError extends Error {}
