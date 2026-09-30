# CLAUDE.md — Vetted

Working rules for Claude Code in this repo. The full brief lives outside the repo at
`../BRIEF.md` (private, never committed). If this file and the brief disagree, the brief wins; say so.

## What this is

Vetted is a GitHub Action (`uses: makoydev/vetted@v1`, Marketplace name "Vetted AI Code Review")
that posts **advisory** AI review comments on pull requests while humans keep the decision.
It is one of two public controls in Michael Mendoza's (makoydev) AI governance portfolio; the other is
`discreet` (Go, privacy LLM gateway). Shared PII detectors live in `sg-pii-rules`.
The portfolio must prove three things: he can ship, he can govern, he can run a programme.
**Evidence beats features.** Never cut an evidence artifact to make room for a capability.

## Current milestone: M1, Vetted v0.1 (due Sun 25 Oct 2026)

In: shadow and opt-in modes, pre-send pipeline (path allow/deny, size cap, secret scrubbing,
PII scrubbing via vendored `sg-pii-rules`), injection defences, schema-validated comments with
disclosure footer, per-run audit artifact, canary suite in CI, `CONTROLS.md` v0, release v0.1.0.
Out until M3: default-on mode, suppressions with `until:`, metrics branch, dashboard, Marketplace.
If something does not fit, move it to "Next" in the README with the reason. Do not stretch dates.

## Non-negotiables

1. No employer or client material of any kind: code, data, schemas, prompts, infra, names.
2. No real personal data anywhere, including fixtures. Synthetic only (Faker + SG generators).
3. Vetted only comments. Never `APPROVE`, `REQUEST_CHANGES` or merge. Never check out or run code from a diff.
4. Every change goes through a PR. Since 2026-09-30 (ADR 0009) Claude merges CI-green PRs into `next`;
   Michael reviews and merges `next` → `main`. Vetted reviews PRs too once it runs.
5. Money is capped: hard daily budget, mock model by default, cheapest model that works,
   no test ever calls a paid API. Whole toolkit under US$20/month.
6. Required evidence: README (5-minute quickstart), `CONTROLS.md`, `THREAT_MODEL.md`, `EVALS.md`
   (real numbers + limitations), `CHANGELOG.md`, LICENSE (Apache-2.0), tests in CI.
7. Secrets never appear in logs, comments, test output or chat. Michael sets secrets himself.

## Security design rules (Vetted-specific)

- Permissions: `contents: read`, `pull-requests: write`, plus `actions: read` for the budget guard only.
- Trigger `pull_request` only, never `pull_request_target`. Fork PRs get no secrets, so they run on the mock.
- Read the diff through the API. Read `.vetted.yml` from the **base** ref, so a PR cannot weaken its own review.
- The diff is delimited untrusted data. Never strip suspected injection text; detect it and report it as a finding.
- Model output must validate against `src/schema/findings.schema.json` before anything is posted.
- Test fixtures build secret-shaped strings at runtime, so the repo never contains a literal that looks like a secret.
- Third-party actions pinned by full commit SHA (with a `# vX.Y.Z` comment); npm deps exact-pinned (`.npmrc` save-exact).

## Stack and conventions

- TypeScript on `node24` (`.nvmrc`; Node 20 was removed from runners on 23 Sep 2026), based on `actions/typescript-action`.
- Bundled to `dist/` (committed; CI checks it is up to date). Jest for tests. ESLint + Prettier (markdown wrap preserved).
- Model client is an interface: `MockModel` (records every request), `OpenAIModel` (default `gpt-6-luna`, low reasoning effort).
- Keep code conventional and readable. Michael must be able to explain every line in an interview.
- Conventional commits. One branch and one PR per issue (`feat/12-secret-scrubbing`). Squash merges only. SemVer tags + GitHub Releases.

## How we work

1. Before an issue: restate its acceptance criteria and list the files you will touch.
2. After: run `npm run all` (format, lint, test, package), update docs + `CHANGELOG.md`, and summarise
   what changed and what was deliberately left out.
3. Keep diffs under ~400 hand-written lines; propose a split if bigger.
4. PRs are opened from Michael's account with the `ai-drafted` label and target `next`. Claude squash-merges
   them once required checks pass and adds `ai-merged` (ADR 0009). Only Michael merges into `main`; releases
   are tagged from `main` after his merge. Never push to `main`.
5. Every PR description ends with **"If asked in an interview"**: 3-4 plain sentences on why the change
   exists and which alternative was rejected.
6. Significant decisions go in `docs/adr/NNNN-title.md` (Context, Options, Decision, Consequences) with
   `Status: drafted by Claude Code, awaiting Michael's review`. Aim for 6-10 per repo.
7. Keep `docs/HOW-THIS-WAS-BUILT.md` current, including a running list of what the AI got wrong and how it was caught.
8. Keep `RISKS.md` (risk, likelihood, impact, mitigation, owner) current.
9. After each milestone, update `docs/CV-NUMBERS.md` (3-5 numbers, how measured, sample size).
10. Ask before changing what the portfolio proves. Make small choices yourself and note them.
    When stuck, say what you tried and what you would do next. Never narrow scope silently.

## Definition of done

Code, tests, docs and changelog updated together. Quickstart and demo still work. No secrets, no real
personal data, no client material. PR has its interview section. Michael has reviewed and merged it.
