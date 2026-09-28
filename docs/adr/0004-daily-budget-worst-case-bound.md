# 0004. Daily budget enforced as a worst-case bound

Status: drafted by Claude Code, awaiting Michael's review
Date: 2026-09-28

## Context

The brief requires a hard daily budget for paid model calls. A GitHub Action keeps no state between runs. Recording actual spend somewhere writable would need `contents: write`, which conflicts with the least-privilege rule that the review job only reads the repository.

## Options

1. **Actual-spend ledger** on a branch or in a cache. Accurate, but needs write access (or a racy cache), and bugs in the ledger could let spend through.
2. **Worst-case bound.** Each run has a hard cost ceiling (maximum input tokens from the diff size cap, plus `max_output_tokens`, times the published price). Before calling the model, Vetted counts today's paid runs through the Actions API and refuses if `(runs today + 1) × ceiling > daily budget`.
3. **Provider-side limits only** (an OpenAI project budget). Useful as a second layer, but it lives outside the repo and can't be shown in CI.

## Decision

Option 2 for M1, with option 3 as defence in depth. This adds one read-only permission, `actions: read`, which is recorded as a deliberate deviation in `CONTROLS.md`. In M3, when the metrics branch exists (written by a separate trusted workflow), a spend ledger can refine the bound.

## Consequences

- The bound is provable from configuration alone: with a US$0.50 daily budget and a US$0.05 ceiling, at most 10 paid runs happen per UTC day.
- It is conservative: real runs cost less than the ceiling, so some budget goes unused.
- Runs refused by the guard still produce an audit artifact saying why.
