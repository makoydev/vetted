import type { ModelClient, ModelRequest, ModelResult } from './client.js'

export const MOCK_SUMMARY =
  'Mock model: no AI review was performed. Configure `openai-api-key` to enable real reviews.'

/**
 * A free, deterministic stand-in for a real model. It records every request
 * it receives, which is how the canary tests prove what would have been sent.
 */
export class MockModel implements ModelClient {
  readonly provider = 'mock' as const
  readonly requests: ModelRequest[] = []

  constructor(
    private readonly respond: (request: ModelRequest) => string = () =>
      JSON.stringify({ summary: MOCK_SUMMARY, findings: [] })
  ) {}

  async complete(request: ModelRequest): Promise<ModelResult> {
    this.requests.push(request)
    const text = this.respond(request)
    return {
      text,
      model: 'mock',
      status: 'completed',
      usage: {
        inputTokens: Math.ceil(
          Buffer.byteLength(request.instructions + request.input) / 4
        ),
        outputTokens: Math.ceil(Buffer.byteLength(text) / 4),
        reasoningTokens: 0
      },
      latencyMs: 0
    }
  }
}
