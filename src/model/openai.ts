import {
  ModelError,
  type ModelClient,
  type ModelRequest,
  type ModelResult
} from './client.js'

const ENDPOINT = 'https://api.openai.com/v1/responses'
const MAX_ATTEMPTS = 3
const TIMEOUT_MS = 90_000
// Billing and quota errors also arrive as HTTP 429; retrying them never helps.
const NO_RETRY_CODES = new Set([
  'credit_balance_exhausted',
  'organization_spend_limit_exceeded',
  'project_spend_limit_exceeded',
  'organization_usage_limit_exceeded',
  'insufficient_quota'
])

interface ResponsesApiBody {
  status?: string
  model?: string
  incomplete_details?: { reason?: string } | null
  output?: {
    type: string
    content?: { type: string; text?: string; refusal?: string }[]
  }[]
  usage?: {
    input_tokens?: number
    output_tokens?: number
    output_tokens_details?: { reasoning_tokens?: number }
  }
  error?: { code?: string; message?: string } | null
}

/**
 * Calls OpenAI's Responses API with plain `fetch`, so every byte sent is
 * built in code a reviewer can read. `store: false` asks OpenAI not to keep
 * the response. Abuse-monitoring logs may still be kept for up to 30 days
 * (THREAT_MODEL.md).
 */
export class OpenAIModel implements ModelClient {
  readonly provider = 'openai' as const

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms))
  ) {
    // No test may call a paid API: with real network access, refuse to exist.
    if (process.env.NODE_ENV === 'test' && fetchImpl === globalThis.fetch) {
      throw new ModelError(
        'OpenAIModel with real network access must not be constructed in tests.'
      )
    }
  }

  async complete(request: ModelRequest): Promise<ModelResult> {
    const body = JSON.stringify({
      model: request.model,
      instructions: request.instructions,
      input: request.input,
      reasoning: { effort: request.reasoningEffort },
      max_output_tokens: request.maxOutputTokens,
      store: false,
      text: {
        format: {
          type: 'json_schema',
          name: 'vetted_findings',
          schema: request.schema,
          strict: true
        }
      }
    })

    const started = Date.now()
    for (let attempt = 1; ; attempt++) {
      let response: Response
      try {
        response = await this.fetchImpl(ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          body,
          signal: AbortSignal.timeout(TIMEOUT_MS)
        })
      } catch (error) {
        if (attempt < MAX_ATTEMPTS) {
          await this.sleep(backoff(attempt))
          continue
        }
        throw new ModelError(`OpenAI request failed: ${(error as Error).name}`)
      }

      const parsed = (await response
        .json()
        .catch(() => ({}))) as ResponsesApiBody
      if (!response.ok) {
        const code = parsed.error?.code ?? ''
        const retryable =
          (response.status === 429 && !NO_RETRY_CODES.has(code)) ||
          response.status >= 500
        if (retryable && attempt < MAX_ATTEMPTS) {
          await this.sleep(retryAfter(response) ?? backoff(attempt))
          continue
        }
        // Never include the request or the key in an error message.
        throw new ModelError(
          `OpenAI API error ${response.status}${code ? ` (${code})` : ''}`
        )
      }
      return toResult(parsed, request.model, Date.now() - started)
    }
  }
}

function backoff(attempt: number): number {
  return 1000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250)
}

function retryAfter(response: Response): number | undefined {
  const seconds = Number(response.headers.get('retry-after'))
  return Number.isFinite(seconds) && seconds > 0
    ? Math.min(seconds, 20) * 1000
    : undefined
}

function toResult(
  body: ResponsesApiBody,
  requestedModel: string,
  latencyMs: number
): ModelResult {
  // A reasoning item can come first; the answer is in the message item.
  const message = body.output?.find((item) => item.type === 'message')
  const refusal = message?.content?.find((c) => c.type === 'refusal')?.refusal
  const text =
    message?.content?.find((c) => c.type === 'output_text')?.text ?? null
  const usage = {
    inputTokens: body.usage?.input_tokens ?? 0,
    outputTokens: body.usage?.output_tokens ?? 0,
    reasoningTokens: body.usage?.output_tokens_details?.reasoning_tokens ?? 0
  }
  const model = body.model ?? requestedModel

  if (refusal !== undefined) {
    return {
      text: null,
      model,
      status: 'refused',
      detail: refusal,
      usage,
      latencyMs
    }
  }
  if (body.status !== 'completed') {
    return {
      text,
      model,
      status: 'incomplete',
      detail: body.incomplete_details?.reason ?? body.status ?? 'unknown',
      usage,
      latencyMs
    }
  }
  return { text, model, status: 'completed', usage, latencyMs }
}
