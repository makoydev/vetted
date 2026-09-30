import { jest } from '@jest/globals'
import { ModelError, type ModelRequest } from '../src/model/client.js'
import { OpenAIModel } from '../src/model/openai.js'

const request: ModelRequest = {
  model: 'gpt-6-luna',
  instructions: 'system',
  input: 'diff',
  schema: { type: 'object' },
  maxOutputTokens: 8000,
  reasoningEffort: 'low'
}

function reply(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
) {
  return new Response(JSON.stringify(body), { status, headers })
}

const completed = {
  status: 'completed',
  model: 'gpt-6-luna',
  output: [
    { type: 'reasoning', summary: [] },
    {
      type: 'message',
      content: [{ type: 'output_text', text: '{"summary":"ok","findings":[]}' }]
    }
  ],
  usage: {
    input_tokens: 1200,
    output_tokens: 310,
    output_tokens_details: { reasoning_tokens: 290 }
  }
}

function client(fetchImpl: typeof fetch) {
  return new OpenAIModel('test-key', fetchImpl, async () => {})
}

describe('OpenAIModel', () => {
  it('refuses to be constructed with real network access in tests', () => {
    expect(() => new OpenAIModel('key')).toThrow(
      /must not be constructed in tests/
    )
  })

  it('sends a strict structured-output request that OpenAI will not store', async () => {
    const fetchImpl = jest.fn<typeof fetch>(async () => reply(200, completed))
    await client(fetchImpl).complete(request)

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/responses')
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-key'
    )
    expect(JSON.parse(init?.body as string)).toEqual({
      model: 'gpt-6-luna',
      instructions: 'system',
      input: 'diff',
      reasoning: { effort: 'low' },
      max_output_tokens: 8000,
      store: false,
      text: {
        format: {
          type: 'json_schema',
          name: 'vetted_findings',
          schema: { type: 'object' },
          strict: true
        }
      }
    })
  })

  it('reads the answer from the message item even when a reasoning item comes first', async () => {
    const result = await client(async () => reply(200, completed)).complete(
      request
    )
    expect(result).toMatchObject({
      text: '{"summary":"ok","findings":[]}',
      model: 'gpt-6-luna',
      status: 'completed',
      usage: { inputTokens: 1200, outputTokens: 310, reasoningTokens: 290 }
    })
  })

  it('reports a refusal instead of text', async () => {
    const body = {
      ...completed,
      output: [
        { type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }
      ]
    }
    const result = await client(async () => reply(200, body)).complete(request)
    expect(result).toMatchObject({
      text: null,
      status: 'refused',
      detail: 'no'
    })
  })

  it('reports output cut off by the token cap as incomplete', async () => {
    const body = {
      ...completed,
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' }
    }
    const result = await client(async () => reply(200, body)).complete(request)
    expect(result).toMatchObject({
      status: 'incomplete',
      detail: 'max_output_tokens'
    })
  })

  it('retries rate limits and server errors, then succeeds', async () => {
    const fetchImpl = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        reply(
          429,
          { error: { code: 'rate_limit_exceeded' } },
          { 'retry-after': '1' }
        )
      )
      .mockResolvedValueOnce(
        reply(503, { error: { code: 'server_is_overloaded' } })
      )
      .mockResolvedValueOnce(reply(200, completed))
    const result = await client(fetchImpl).complete(request)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(result.status).toBe('completed')
  })

  it('never retries a spend-limit error, which also arrives as 429', async () => {
    const fetchImpl = jest.fn<typeof fetch>(async () =>
      reply(429, { error: { code: 'project_spend_limit_exceeded' } })
    )
    await expect(client(fetchImpl).complete(request)).rejects.toThrow(
      'OpenAI API error 429 (project_spend_limit_exceeded)'
    )
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('gives up after three attempts, without the key or prompt in the error', async () => {
    const fetchImpl = jest.fn<typeof fetch>(async () => reply(500, {}))
    const error = await client(fetchImpl)
      .complete(request)
      .catch((e: Error) => e)
    expect(error).toBeInstanceOf(ModelError)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(String(error)).not.toContain('test-key')
    expect(String(error)).not.toContain('diff')
  })

  it('retries network failures', async () => {
    const fetchImpl = jest
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(reply(200, completed))
    expect((await client(fetchImpl).complete(request)).status).toBe('completed')
  })
})
