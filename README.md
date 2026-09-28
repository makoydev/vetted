# Vetted

Governed, advisory AI code review for GitHub Actions. Vetted posts review comments; humans keep the decision.

> **Status: pre-release.** Building towards v0.1.0 (due 25 Oct 2026). Nothing here is ready to install yet. Progress: [project board](https://github.com/users/makoydev/projects/1) · [milestone](https://github.com/makoydev/vetted/milestone/1).

## What it will do

- **Scrub before sending.** Deny-listed paths, a diff size cap, secret scrubbing (gitleaks rules plus an entropy check) and Singapore personal-data scrubbing ([`sg-pii-rules`](https://github.com/makoydev/sg-pii-rules)) run before anything reaches a model.
- **Resist prompt injection.** The diff is treated as untrusted data, the model has no tools, and its output must match a schema. Suspected injection text is reported as a finding, not hidden.
- **Advise, never decide.** Comments are tagged `[AI]` with severity, confidence, rationale and a disclosure footer (model, tokens, cost). Vetted never approves, requests changes or merges.
- **Roll out gradually.** `shadow` mode (audit only) and `opt-in` mode (label `ai-review`).
- **Leave an audit trail.** Every run uploads an audit record: prompt hash, model, tokens, cost, scrub counts, findings, latency.

## How this project is run

- Decisions: [`docs/adr/`](docs/adr) · Risks: [`RISKS.md`](RISKS.md) · Plan: [`docs/M1-PLAN.md`](docs/M1-PLAN.md)
- AI assistance and its guardrails: [`docs/HOW-THIS-WAS-BUILT.md`](docs/HOW-THIS-WAS-BUILT.md)
- Changes: [`CHANGELOG.md`](CHANGELOG.md)

## Licence

[Apache-2.0](LICENSE)
