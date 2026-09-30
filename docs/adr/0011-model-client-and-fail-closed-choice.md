# 0011. A plain-fetch model client, and a model choice that fails closed

Status: drafted by Claude Code, awaiting Michael's review
Date: 2026-09-30

## Context

ADR 0003 chose OpenAI behind a `ModelClient` interface. Two questions remained: how to call the API, and what Vetted should do when anything about a paid call is uncertain (no key, a fork, an unknown price, the budget, an unreadable run count).

## Options

For the client:

1. **OpenAI's SDK.** Convenient, but a large dependency in the bundle, and what goes over the wire is less visible in review.
2. **Plain `fetch` to the Responses API.** About 150 readable lines; every byte sent is built in `src/model/openai.ts`.

For uncertainty:

1. **Fail open.** Call the model and log a warning. Better review coverage, but the budget and fork rules become advice.
2. **Fail closed.** Anything uncertain means the free `MockModel` is used, and the reason is logged and recorded.

## Decision

A plain-`fetch` client and fail-closed selection.

- Requests use strict structured output with a copy of the findings schema that drops keywords strict mode may reject; Vetted still validates the full schema itself (#7).
- `store: false`, so OpenAI keeps no stored copy of the response. OpenAI's abuse-monitoring logs may still hold prompts for up to 30 days; the threat model says so.
- Retries: up to three attempts for 429 and 5xx, honouring `Retry-After` (capped at 20 s), but never for spend-limit or quota errors, which also arrive as 429.
- Errors never include the request body or the key. The key is masked in logs with `core.setSecret`.
- The paid model is used only if the gate allows it (not a fork, key present), the model has a known price, today's runs can be counted, and the worst case still fits the daily budget.
- The OpenAI client throws if constructed with real network access while `NODE_ENV` is `test`, so "no test calls a paid API" is enforced in code, not only by convention.

## Consequences

- A misconfiguration (for example a typo in the model name, or a workflow without `actions: read`) silently reduces Vetted to the mock rather than spending money. The run log and, from #8, the audit record say why.
- The price table (`src/model/pricing.ts`) must be updated when OpenAI changes prices; an unlisted model can't be used for paid reviews.
