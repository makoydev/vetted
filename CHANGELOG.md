# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Config file `.vetted.yml` (`limits.max_diff_bytes` is measured in UTF-8 bytes, which bounds input tokens), read from the pull request's **base** commit and validated against a JSON Schema; invalid config fails closed (nothing is sent) ([#3](https://github.com/makoydev/vetted/issues/3)).
- Mode gating: `shadow` runs on every pull request and never comments; `opt-in` runs only with the `ai-review` label and ignores unrelated label events; fork pull requests and runs without an API key use the mock model.
- Changed files are read through the GitHub REST API; Vetted never checks out the pull request's code. Only `pull_request` events are supported; `pull_request_target` is refused.
- Action inputs `github-token`, `openai-api-key` (masked in logs) and `config-path`.
- Pre-send pipeline, first part ([#4](https://github.com/makoydev/vetted/issues/4)): a default deny list that config can extend or narrow but never re-open (`.env*`, `secrets/**`, keys and certificates, credential files, lockfiles, generated and vendored code, binaries); removed files and files without a text diff are skipped; a file cap and a character cap skip whole files and list them, never truncating one silently.
- Secret scrubbing ([#4](https://github.com/makoydev/vetted/issues/4)): gitleaks' 221 default text rules (v8.30.1, vendored with checksums and licence) run with `re2js`, with five deliberate, tested differences that make it stricter (ADR 0010); plus an entropy backstop (32+ characters above 4.3 bits) for secrets no rule names. Parity with the real gitleaks binary: nothing gitleaks found was missed on its 3,658 test strings, and results were identical on 2,028 real source files.
- Personal-data scrubbing ([#5](https://github.com/makoydev/vetted/issues/5)): Singapore NRIC/FIN (valid check letter), NRIC look-alikes with a wrong check letter (scrubbed too, so a mistyped NRIC never leaks), Singapore phone numbers and email addresses are replaced with `<NRIC>`, `<NRIC_LIKE>`, `<PHONE>` and `<EMAIL>`. Rules come from sg-pii-rules `v0.1.0-rc.1`, vendored with checksums (`scripts/vendor-sg-pii-rules.sh`); Vetted's implementation passes all 184 shared conformance cases.
- Model client ([#6](https://github.com/makoydev/vetted/issues/6)): OpenAI's Responses API over plain `fetch` (`gpt-6-luna` by default, low reasoning effort, strict structured output, `store: false`), retries for rate limits and server errors but never for spend-limit errors, and a free `MockModel` that records every request. The OpenAI client refuses to be constructed with real network access inside tests.
- Prompt: fixed system instructions that call the diff untrusted data, the diff wrapped in markers with a random 64-bit nonce, and a SHA-256 of exactly what is sent.
- Budget guard (ADR 0004): a hard per-run ceiling from the prompt's byte cap and the output-token cap, and at most `daily_budget_usd / ceiling` paid runs per UTC day, counted through the Actions API. An unknown model price, an unreadable run count or a used-up budget all fall back to the mock model.
- Findings and comments ([#7](https://github.com/makoydev/vetted/issues/7)): model output must match the findings schema (lengths included) or none of it is used; findings are checked against the lines actually in the diff; rule-based prompt-injection detection (override attempts, chat-template role markers, reviewer manipulation, prompt-exfiltration requests, invisible and bidirectional-control characters) reports each hit as its own `[Vetted]` finding while leaving the text in the diff; AI findings are posted as `[AI]` review comments with severity, confidence, category and a disclosure footer (model, version, tokens, cost, redaction counts); reviews are always posted with event `COMMENT`; model text is sanitised (no links, images, HTML or mentions) before posting (ADR 0012).
- Scripts: `npm run vendor:gitleaks`, `npm run parity:gitleaks`, `npm run measure:entropy`.
- Diff handling: each file's patch is parsed into numbered lines; the model sees new-file line numbers; redaction keeps the line structure intact, including for secrets that span several lines.

### Changed

- Workflow: pull requests now target the protected `next` integration branch and are merged by Claude Code once CI passes; Michael reviews and merges `next` into `main` (ADR 0009). CI runs on `next`; Dependabot targets `next` and skips major upgrades of `typescript` and `@types/node`.

### Added

- Project scaffold from the `actions/typescript-action` template on the `node24`
  runtime, with a `mode` input (`shadow`, `opt-in`) that fails closed on unknown
  values ([#1](https://github.com/makoydev/vetted/issues/1)).
- CI: format, lint, tests, `dist/` freshness check, and a job that runs the
  action itself. CodeQL for TypeScript and workflow files. All third-party
  Actions pinned by commit SHA and kept current by Dependabot.
- `CLAUDE.md` working rules and the Milestone 1 plan in `docs/M1-PLAN.md`.
- ADRs 0001–0008, `RISKS.md`, `docs/HOW-THIS-WAS-BUILT.md`, and a README describing intended behaviour and status ([#1](https://github.com/makoydev/vetted/issues/1)).
