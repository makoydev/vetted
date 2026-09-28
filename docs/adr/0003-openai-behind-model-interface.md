# 0003. OpenAI behind a ModelClient interface, gpt-6-luna by default

Status: accepted, with an amendment. Drafted by Claude Code; reviewed by Michael Mendoza on 2026-09-28, who changed the default model from `gpt-5-nano` to `gpt-6-luna`.
Date: 2026-09-28

## Context

Vetted needs one real model for the pilot, and a mock for tests and public demos. The brief requires the cheapest model that works, a hard daily budget, and that no test ever calls a paid API. On 28 September 2026, OpenAI lists these prices per million tokens (standard tier):

| Model        | Input   | Output  | Notes                                                                                                                                    |
| ------------ | ------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `gpt-6-luna` | US$0.10 | US$0.50 | Released May 2026; recommended by OpenAI for cost-sensitive, high-volume work; Structured Outputs; reasoning effort from `none` to `max` |
| `gpt-5-nano` | US$0.05 | US$0.40 | Previous generation; Structured Outputs                                                                                                  |

A typical review of about 8,000 input and 2,000 output tokens costs roughly US$0.002 on `gpt-6-luna` and US$0.001 on `gpt-5-nano`.

## Options

1. **OpenAI** small models. Michael's choice; the same adapter shape is reusable for Discreet's OpenAI-compatible upstream later.
2. **Anthropic Claude Haiku.** Comparable quality, higher price per token for this workload.
3. **GitHub Models free tier.** No key and no cost, but it needs an extra permission, rate limits and the model list can change, and a cost metric of zero would be notional.

Within option 1, `gpt-5-nano` is the cheapest; `gpt-6-luna` is the newest small model and about twice the price per review.

## Decision

Option 1 with `gpt-6-luna` as the default, run at `low` reasoning effort, behind a `ModelClient` interface with two implementations: `MockModel` (deterministic, records every request it receives) and `OpenAIModel`. The model is configurable per repo. Structured Outputs are requested, **and** Vetted validates the response against its own JSON Schema before posting anything. Provider-side enforcement is not treated as sufficient on its own.

Michael chose `gpt-6-luna` over the cheaper `gpt-5-nano`: the price difference is a fraction of a cent per review, and the newer model is expected to give better findings.

## Consequences

- Switching provider or model means changing config or writing one adapter, not touching the pipeline.
- "Cheapest model that works" is tested, not assumed: `EVALS.md` v0 compares `gpt-6-luna` with `gpt-5-nano` on the same fixture pull requests. If nano's findings are as good, this ADR is revisited.
- The budget guard's per-run ceiling (ADR 0004) uses Luna's prices.
- Tests construct only `MockModel`; a test enforces this.
