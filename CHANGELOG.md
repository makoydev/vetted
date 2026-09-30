# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Vetted's self-review is pinned to the v0.1.0 release commit.

## [0.1.0] - 2026-10-01

First release (Milestone 1): governed, advisory AI code review for GitHub Actions. Reviewed and approved by Michael Mendoza on 2026-10-01.

### Added

- **Rollout and config** ([#3](https://github.com/makoydev/vetted/issues/3)): `shadow` mode reviews every pull request and only writes an audit record; `opt-in` mode reviews pull requests labelled `ai-review` and comments. Fork pull requests and runs without an API key use the free mock model. `.vetted.yml` is read from the pull request's **base** commit and validated against a JSON Schema with hard upper bounds; invalid config fails closed. Only `pull_request` events are accepted; the diff is read through the API and the pull request's code is never checked out.
- **Pre-send pipeline** ([#4](https://github.com/makoydev/vetted/issues/4), [#5](https://github.com/makoydev/vetted/issues/5)):
  - a default deny list (`.env*`, `secrets/**`, keys, credential files, lockfiles, generated and vendored code, binaries) that config can extend or narrow but never re-open;
  - file and size caps (in UTF-8 bytes) that skip whole files and list them;
  - secret scrubbing with gitleaks' 221 text rules (v8.30.1, vendored with checksums and licence) on RE2, five deliberate stricter differences (ADR 0010), and an entropy backstop;
  - Singapore personal-data scrubbing (NRIC/FIN, NRIC look-alikes, phone, email) from sg-pii-rules `v0.1.0`, vendored with checksums;
  - redaction that keeps every line number intact.
- **Model and budget** ([#6](https://github.com/makoydev/vetted/issues/6)): OpenAI's Responses API over plain `fetch` (`gpt-6-luna` by default, strict structured output, `store: false`, careful retries), a recording `MockModel`, system instructions that label the diff untrusted with a random-nonce delimiter, and a hard daily budget as a worst-case bound (ADR 0004). Anything uncertain falls back to the mock (ADR 0011).
- **Findings and comments** ([#7](https://github.com/makoydev/vetted/issues/7)): schema validation of model output (lengths included); findings checked against the lines in the diff; rule-based prompt-injection detection in added lines and file names, reported as `[Vetted]` findings while the text stays in the diff; `[AI]` review comments with severity, confidence, category and a disclosure footer; posting with event `COMMENT` only; model text sanitised before posting (ADR 0012).
- **Audit and evidence** ([#8](https://github.com/makoydev/vetted/issues/8), [#9](https://github.com/makoydev/vetted/issues/9)): a schema-validated audit record for every run (hashes and counts, never code), uploaded as a workflow artifact; the canary suite (17 synthetic pull requests, 144 canary values, 4 output channels, 0 leaks, and it fails when any protection is removed); `CONTROLS.md`, `THREAT_MODEL.md`, `EVALS.md`, `docs/CV-NUMBERS.md`, and user and developer quickstarts.
- **Tooling and CI** ([#1](https://github.com/makoydev/vetted/issues/1)): TypeScript on `node24` from GitHub's template; CI with lint, 408 unit tests, the canary suite, a `dist/` check, running the action, and CodeQL (all required); SHA-pinned Actions and Dependabot; scripts `vendor:gitleaks`, `parity:gitleaks`, `measure:entropy`.
- **Pilot**: Vetted reviews its own pull requests (pinned to a merged commit, never `uses: ./`) and the new `discreet` repository from its first pull request (shadow mode until 2026-10-14, then opt-in).
- ADRs 0001–0012, `RISKS.md`, and `docs/HOW-THIS-WAS-BUILT.md`, including every AI mistake and how it was caught.

### Process

- From 2026-09-30, pull requests targeted the protected `next` integration branch and were merged by Claude Code once every check passed (ADR 0009). Michael reviewed the batch with a decision report and approved it on 2026-10-01; at his instruction, Claude Code rebase-merged `next` into `main` and published this release.

### Known limitations

- No real-model numbers yet: every review so far used the mock model, because `OPENAI_API_KEY` isn't set (`EVALS.md` §8).
- `PHONE` fires on bare eight-digit numeric constants in code (`EVALS.md` §3).
- Base64-encoded secrets aren't decoded; names and addresses aren't detected.

[Unreleased]: https://github.com/makoydev/vetted/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/makoydev/vetted/releases/tag/v0.1.0
