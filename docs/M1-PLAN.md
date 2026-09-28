# Milestone 1 plan: Vetted v0.1 (draft for Michael's approval)

Status: drafted by Claude Code, awaiting Michael's review. Due: **Sun 25 Oct
2026** (end of week 4, where week 1 starts Mon 28 Sep). Budget: about 30 of
Michael's hours. Sizes are in Michael's time (review, running, decisions): **S**
≈ 1–2h, **M** ≈ 3–4h, **L** ≈ 5–6h.

## Decisions already taken (each becomes an ADR in issue #1)

| #    | Decision                                                                                                                                                           | Rejected alternative                                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| 0001 | Separate repos (`vetted`, `sg-pii-rules`, `discreet`, `makoydev.github.io`), all public from day one                                                               | Monorepo. The Marketplace needs `action.yml` at the root of a single-action repo, and branch protection is free only on public repos |
| 0002 | TypeScript JS action on `node24`, from the `actions/typescript-action` template, `dist/` committed                                                                 | Docker action (slower cold start, harder to pin). Composite action (logic in shell is hard to test)                                  |
| 0003 | OpenAI behind a `ModelClient` interface, default `gpt-5-nano`, with Structured Outputs _and_ our own schema validation                                             | Claude Haiku / GitHub Models (Michael's call). Trusting provider-side schema enforcement alone                                       |
| 0004 | Hard daily budget as a **worst-case bound**: per-run cost ceiling × max paid runs per UTC day (counted via the Actions API) ≤ daily budget                         | Actual-spend ledger. That needs a writable store, which conflicts with `contents: read`; it comes in M3 with the metrics branch      |
| 0005 | Secret rules: gitleaks' default rule set vendored at a pinned tag and executed with `re2js` (pure-JS RE2, same regex semantics as Go) plus a Shannon-entropy check | Shelling out to a downloaded gitleaks binary (a supply-chain step at runtime). Hand-written regexes (not the recognised rule set)    |
| 0006 | Suspected injection text stays in the diff; a detector reports each hit as its own finding                                                                         | Stripping it (hides it from the human reviewer and can change what the code means)                                                   |
| 0007 | Config read from the PR's **base** ref; `pull_request` trigger only; fork PRs run on the mock                                                                      | Reading config from the head ref (a PR could disable its own review). `pull_request_target` (runs with secrets on untrusted code)    |
| 0008 | PRs opened from Michael's account, labelled `ai-drafted`; protection = PR + green checks, 0 approvals                                                              | Machine account with 1 required approval (stronger evidence; can be revisited later)                                                 |

## Where I think the brief needs adjusting (flagging, not silently changing)

1. **`contents: read` vs the `metrics` branch.** Appending to a branch needs
   `contents: write`. In M3 I will split this into a second workflow
   (`workflow_run`, trusted context, never touches the diff) that has write
   access only to `metrics`. The review job keeps `contents: read`. That split
   is a good security story in itself.
2. **"Hard daily budget" in a stateless Action.** See ADR 0004. It needs one
   extra read-only permission, `actions: read`. I think that is justified; it
   goes into `CONTROLS.md` as a deliberate deviation.
3. **Fake secrets in fixtures.** GitHub push protection will block literal fake
   keys, and Vetted would flag its own fixtures. Fixtures build secret-shaped
   strings at runtime.
4. **Self-approval.** Since you chose your own account, "Michael reviews and
   merges" is enforced by process, not by an approval gate. The build log will
   say so honestly.

## Repo layout

```
vetted/
├── action.yml                   # name: "Vetted AI Code Review", runs: node24, main: dist/index.js
├── dist/                        # bundled output (committed, CI checks it matches src)
├── src/
│   ├── main.ts                  # orchestration only: context → gate → pipeline → model → post → audit
│   ├── config.ts                # inputs + .vetted.yml (base ref) → typed Config
│   ├── gate.ts                  # mode logic: shadow | opt-in (label `ai-review`); fork detection
│   ├── diff/fetch.ts            # PR files via REST API (no checkout)
│   ├── pipeline/
│   │   ├── paths.ts             # allow/deny globs, binary + lockfile detection
│   │   ├── size.ts              # diff size cap
│   │   ├── secrets.ts           # gitleaks rules (re2js) + entropy
│   │   ├── pii.ts               # vendored sg-pii-rules detectors
│   │   └── index.ts             # runs stages in order, returns ScrubbedDiff + ScrubReport (counts only)
│   ├── injection.ts             # known-pattern detector → findings of its own
│   ├── model/
│   │   ├── client.ts            # ModelClient interface
│   │   ├── openai.ts            # OpenAI adapter (Structured Outputs, max_output_tokens)
│   │   ├── mock.ts              # deterministic mock that records every request it receives
│   │   ├── prompt.ts            # system prompt + delimited untrusted diff
│   │   └── budget.ts            # per-run ceiling + daily worst-case guard
│   ├── schema/findings.schema.json
│   ├── findings.ts              # ajv validation of model output
│   ├── comments.ts              # render [AI] comments + disclosure footer; post with event COMMENT only
│   └── audit.ts                 # per-run audit JSON + artifact upload
├── vendor/
│   ├── sg-pii-rules/            # tagged release v0.1.0 + SHA256SUMS
│   └── gitleaks/                # gitleaks.toml at a pinned tag + LICENSE + SHA256SUMS
├── __tests__/
│   ├── unit/                    # one file per src module
│   ├── canary/                  # end-to-end pipeline runs against the recording mock
│   └── fixtures/                # synthetic PR diffs; secret-shaped strings generated at runtime
├── .github/workflows/
│   ├── ci.yml                   # lint, test, canary, dist check, vendor checksum check
│   └── vetted.yml               # dogfood: Vetted reviews its own PRs
├── docs/adr/  docs/HOW-THIS-WAS-BUILT.md  docs/CV-NUMBERS.md
├── CONTROLS.md  THREAT_MODEL.md  EVALS.md  RISKS.md  CHANGELOG.md  README.md  LICENSE  CLAUDE.md
└── .vetted.yml  .nvmrc (24)
```

## Packages (exact-pinned)

`@actions/core`, `@actions/github`, `@actions/artifact`, `openai`, `ajv`,
`yaml`, `picomatch`, `re2js`. Dev: template defaults (TypeScript, Rollup, Jest,
ESLint, Prettier) plus `@faker-js/faker` for synthetic data. GitHub Actions in
workflows are pinned by full SHA, and Dependabot keeps them current.

## Test strategy

- **Unit (Jest):** every pipeline stage, the gate, the budget guard, schema
  validation and comment rendering. Table-driven, with hard negatives.
- **Canary suite (the headline control):** about 15 synthetic fixture PRs
  covering fake secrets (AWS, GitHub, OpenAI, Slack, private-key shapes and
  high-entropy strings), fake NRIC/FIN/phone/email, and injection payloads in
  code, comments, strings and filenames. Each runs through the _full_ pipeline
  into the recording mock. The test fails if any canary value appears in any
  recorded request. The job prints `canary leaks: 0` and uploads the report.
- **Contract test:** the mock's canned responses must validate against
  `findings.schema.json`, and deliberately invalid responses must result in
  nothing being posted.
- **Guard tests:** a test proves the posting code can only send
  `event: "COMMENT"`, and another proves the budget guard refuses a run that
  would exceed the ceiling.
- **No test ever calls a paid API.** `OPENAI_API_KEY` is unset in CI's test job,
  and the OpenAI adapter throws if it is constructed in test mode.
- **Dogfood:** Vetted in shadow mode on its own PRs from issue #6 onward, and on
  `discreet` from that repo's first PR.

## Issues

### #1 Bootstrap the vetted repo — M

Template scaffold, `action.yml` skeleton, `node24`, CI (lint, test, dist check),
Apache-2.0, README stub, CHANGELOG, CLAUDE.md, RISKS.md, HOW-THIS-WAS-BUILT.md,
ADRs 0001–0008, labels (`ai-drafted`, `ai-review`, `ai-false-positive`), branch
protection, milestone M1, project board. **AC:** CI green on an empty action;
`main` rejects direct pushes; every Action pinned by SHA; 8 ADRs drafted; board
shows all M1 issues.

### #2 sg-pii-rules v0.1.0 (in the `sg-pii-rules` repo) — L

`detectors.json` (JSON Schema-validated; RE2-subset regex + named validator +
entity type) for NRIC/FIN (S, T, F, G, M series with checksums), SG phone
numbers and email. Synthetic generators, fixtures with true positives and hard
negatives (NRIC-shaped order numbers, 8-digit non-phones), a conformance-fixture
format any implementation can run, and a tiny reference TS runner in CI. Tag
v0.1.0 with `SHA256SUMS`. **AC:** schema validation and reference conformance
green in CI; ≥20 true positives and ≥20 hard negatives per entity; M-series
checksum cited from a primary source (or marked unverified); the README states
data is synthetic.

### #3 Config, mode gating and diff fetch — M

Inputs + `.vetted.yml` from the base ref; `shadow` (audit only) and `opt-in`
(`ai-review` label) modes; fork PRs force the mock; fetch changed files via the
REST API. **AC:** unit tests for each mode × label × fork combination; a test
proves config comes from the base SHA; no `actions/checkout` of the PR head
anywhere.

### #4 Pre-send pipeline: paths, size, secrets — L

Deny list by default (`.env*`, lockfiles, binaries, `secrets/**`, keys/certs)
with an allow list override; diff size cap (skip with an explanation, never
truncate silently); vendored gitleaks rules via `re2js` + entropy check; a scrub
report with counts per rule (never the values). **AC:** each gitleaks rule we
ship has a passing generated positive; entropy hard negatives (hashes in
lockfiles, UUIDs) don't fire; the vendored checksum is verified in CI; the
report contains no scrubbed value.

### #5 Pre-send pipeline: PII via vendored sg-pii-rules — M

TS implementation of the `detectors.json` semantics; replace hits with typed
placeholders (`<NRIC>`); run the sg-pii-rules conformance fixtures in Vetted's
CI; checksum check against the v0.1.0 release. **AC:** 100% of conformance
fixtures pass; CI fails if the vendored file is edited; recall and precision on
fixtures recorded in EVALS.md.

### #6 Model client, prompt and budget guard — L

`ModelClient` interface, recording `MockModel`, `OpenAIModel` (`gpt-5-nano`
default, low reasoning effort, `max_output_tokens`), a system prompt that treats
the diff as delimited untrusted data and forbids following embedded
instructions, SHA-256 prompt hash, and a budget guard (ADR 0004). Turn on
dogfood in shadow mode. **AC:** a test proves no test path constructs
`OpenAIModel`; the budget guard refuses when ceiling × runs today would exceed
the daily budget; the dogfood workflow runs green in shadow mode on this PR.

### #7 Findings schema, injection detector and comments — M

`findings.schema.json` (file, line, severity, confidence, rule, rationale); ajv
validation (invalid means post nothing and record it in the audit);
known-injection-pattern detector emitting its own findings; `[AI]` comments with
a disclosure footer (model, version, tokens, cost); posting with
`event: COMMENT` only. **AC:** invalid output posts zero comments; each
injection fixture yields an injection finding and its text is still present in
the diff sent to the model; the guard test proves `APPROVE` / `REQUEST_CHANGES`
are unreachable.

### #8 Audit artifact and canary suite — M

Per-run audit JSON (prompt hash, model, tokens, cost, scrub counts, findings,
latency, mode, decision) uploaded as a workflow artifact; the full canary suite
as its own CI job. **AC:** audit JSON validates against its own schema and
contains no diff text; canary job green with `canary leaks: 0` on about 15
fixture PRs; the canary job is a required status check.

### #9 Pilot on discreet, evidence docs, v0.1.0 — L

Create the `discreet` repo whose first PR adds Vetted in shadow mode; switch
Vetted's own repo to opt-in; `CONTROLS.md` v0 (tier-1 frameworks, primary
sources, "unverified" where not read); `THREAT_MODEL.md`; `EVALS.md` v0 (canary
results, PII fixture numbers, nano-vs-mini on ~10 fixture PRs with sample size
and limits); README five-minute quickstart tested on a clean clone;
`docs/CV-NUMBERS.md`; release v0.1.0. **AC:** the quickstart works from a fresh
clone; every CONTROLS row cites a source + section or says "unverified"; Vetted
produced an audit artifact on the discreet repo's first PR; the v0.1.0 GitHub
Release exists.

**Total:** 4 + 6 + 4 + 6 + 3 + 6 + 4 + 3 + 6 ≈ **42h at the top of each range,
about 30h at the bottom.** That is tight. **Cut line, in order, if we are behind
at the end of week 3:** (1) nano-vs-mini comparison → Next; (2) entropy check →
Next (gitleaks rules only); (3) sg-pii-rules drops email and keeps NRIC/FIN +
phone. Canary suite, audit artifact and CONTROLS.md are never cut.

## Week plan

- **Week 1 (28 Sep):** #1, #2
- **Week 2 (5 Oct):** #3, #4
- **Week 3 (12 Oct):** #5, #6 (dogfood starts), then create the `discreet` repo
- **Week 4 (19 Oct):** #7, #8, #9 → v0.1.0 on or before 25 Oct

## Things only Michael can do (I will prompt at the right time)

- `gh auth refresh -s project` (needed to create the Projects board).
- Create a dedicated OpenAI project with a monthly budget, create a key
  restricted to that project, then run
  `! gh secret set OPENAI_API_KEY -R makoydev/vetted` yourself. Never paste the
  key into chat.
- Enable 2FA on the GitHub account (the Marketplace needs it in M3).
- Review and edit every ADR, then change its status line.
