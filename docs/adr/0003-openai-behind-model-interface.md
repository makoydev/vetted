# 0003. OpenAI behind a ModelClient interface, gpt-5-nano by default

Status: drafted by Claude Code, awaiting Michael's review
Date: 2026-09-28

## Context

Vetted needs one real model for the pilot, and a mock for tests and public demos. The brief requires the cheapest model that works, a hard daily budget, and that no test ever calls a paid API. At the time of writing, OpenAI lists `gpt-5-nano` at US$0.05 per million input tokens and US$0.40 per million output tokens, and `gpt-5-mini` at US$0.25 and US$2.00. Both support Structured Outputs.

## Options

1. **OpenAI** small models. Michael's choice; the same adapter shape is reusable for Discreet's OpenAI-compatible upstream later.
2. **Anthropic Claude Haiku.** Comparable quality, higher price per token for this workload.
3. **GitHub Models free tier.** No key and no cost, but it needs an extra permission, rate limits and the model list can change, and a cost metric of zero would be notional.

## Decision

Option 1, behind a `ModelClient` interface with two implementations: `MockModel` (deterministic, records every request it receives) and `OpenAIModel`. The default model is `gpt-5-nano`, configurable per repo. Structured Outputs are requested, **and** Vetted validates the response against its own JSON Schema before posting anything. Provider-side enforcement is not treated as sufficient on its own.

## Consequences

- Switching provider means writing one adapter, not touching the pipeline.
- "Cheapest model that works" is tested, not assumed: `EVALS.md` v0 compares nano and mini on the same fixture pull requests.
- Tests construct only `MockModel`; a test enforces this.
