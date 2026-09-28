# How this was built

Vetted is built with AI assistance (Claude Code) under the same kind of controls it provides. This file is part of the evidence: it records how the assistance was governed and where it went wrong.

## Who does what

- **Michael Mendoza** sets scope and priorities, answers design questions, reviews every pull request, edits and confirms every ADR, and merges. He handles all credentials himself.
- **Claude Code** (Claude Opus 5.5) drafts plans, code, tests and documentation, opens pull requests from Michael's account with the `ai-drafted` label, and adds a `Co-Authored-By` trailer to every commit.

## Guardrails

1. **A written brief** (kept outside the repo because it contains private context) and `CLAUDE.md`, which distils it: scope, non-negotiables, conventions.
2. **Plan approval before code.** The Milestone 1 plan (`docs/M1-PLAN.md`) was approved before any product code was written.
3. **Pull requests only.** `main` is protected: pull request required, CI checks required (lint and test, dist check, running the action, CodeQL), conversations resolved, linear history, applied to admins. GitHub does not allow self-approval, so zero approvals are required and review is enforced by process (ADR 0008).
4. **Explain-back.** Every pull request ends with "If asked in an interview".
5. **Decisions recorded** as ADRs marked "awaiting Michael's review" until he confirms them.
6. **Tests in CI**, and from issue #6 onward Vetted reviews its own pull requests.

## Decisions changed on human review

| Date       | Proposed by Claude Code                         | Changed by Michael to                                                                            | Where    |
| ---------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------- |
| 2026-09-28 | Default model `gpt-5-nano`, the cheapest option | `gpt-6-luna`, the newer small model; the cheaper model stays in the evaluation as the comparison | ADR 0003 |

## Exceptions

- The very first commit (`LICENSE`, a README stub, `.gitignore`) was pushed directly to `main`, because branch protection needs the branch to exist first. Every later change goes through a pull request.

## What the AI got wrong, and how it was caught

| Date       | What went wrong                                                                                                                                               | How it was caught                                         | Fix                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------- |
| 2026-09-28 | Kept the template's Prettier setting `proseWrap: always`, which hard-wrapped all Markdown and pushed `CLAUDE.md` from 67 to 106 lines, over its 80-line limit | Line-count check before committing                        | Switched to `proseWrap: preserve` and restored the unwrapped text |
| 2026-09-28 | Looking up the latest CodeQL Action release returned a CodeQL _bundle_ tag, not an Action version                                                             | Noticed the tag format didn't match `v4.x` before pinning | Pinned to the `v4.38.2` tag's commit instead                      |
| 2026-09-28 | First attempt to add required status checks used an endpoint that only updates existing check settings, and failed with a 404                                 | API error                                                 | Re-applied the full branch protection with the checks included    |
