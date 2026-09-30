# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Config file `.vetted.yml`, read from the pull request's **base** commit and validated against a JSON Schema; invalid config fails closed (nothing is sent) ([#3](https://github.com/makoydev/vetted/issues/3)).
- Mode gating: `shadow` runs on every pull request and never comments; `opt-in` runs only with the `ai-review` label and ignores unrelated label events; fork pull requests and runs without an API key use the mock model.
- Changed files are read through the GitHub REST API; Vetted never checks out the pull request's code. Only `pull_request` events are supported; `pull_request_target` is refused.
- Action inputs `github-token`, `openai-api-key` (masked in logs) and `config-path`.
- Pre-send pipeline, first part ([#4](https://github.com/makoydev/vetted/issues/4)): a default deny list that config can extend or narrow but never re-open (`.env*`, `secrets/**`, keys and certificates, credential files, lockfiles, generated and vendored code, binaries); removed files and files without a text diff are skipped; a file cap and a character cap skip whole files and list them, never truncating one silently.
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
