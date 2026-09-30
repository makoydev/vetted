/**
 * Prices in US$ per million tokens, from OpenAI's pricing page on
 * 2026-09-30 (https://developers.openai.com/api/docs/pricing), standard
 * tier, prompts under 272K tokens. A model not listed here has no known
 * price, so its cost cannot be bounded and Vetted will not call it.
 */
export const PRICES: Record<string, { input: number; output: number }> = {
  'gpt-6-luna': { input: 0.1, output: 0.5 },
  'gpt-5-nano': { input: 0.05, output: 0.4 },
  'gpt-5-mini': { input: 0.25, output: 2.0 }
}

export function priceOf(model: string) {
  return PRICES[model]
}

/** Cost of a finished call. Cached input is charged at the full price. */
export function costUsd(
  model: string,
  usage: { inputTokens: number; outputTokens: number }
): number {
  const price = PRICES[model]
  if (price === undefined) return 0
  return (
    (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1e6
  )
}

/**
 * The most one call can cost. A token is never smaller than one byte, so
 * the prompt's UTF-8 size bounds the input tokens, and `max_output_tokens`
 * bounds the output (reasoning included).
 */
export function ceilingUsd(
  model: string,
  maxPromptBytes: number,
  maxOutputTokens: number
): number | undefined {
  const price = PRICES[model]
  if (price === undefined) return undefined
  return (maxPromptBytes * price.input + maxOutputTokens * price.output) / 1e6
}
