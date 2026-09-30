# 0009. Integration branch: Claude Code merges into `next`, Michael merges `next` into `main`

Status: accepted. Chosen by Michael Mendoza on 2026-09-30, from options drafted by Claude Code. This changes the brief's non-negotiable that Michael merges every pull request himself.
Date: 2026-09-30

## Context

Until now every change waited for Michael to review and merge it (ADR 0008). With a full-time job and a job search, that made him the bottleneck: work stopped between his reviews, and dependent changes had to be stacked and rebased. He asked for Claude Code to work through Milestone 1 without waiting, and to review the implementation decisions at the end.

Claude Code acts through Michael's GitHub account, so anything it merges appears on GitHub as merged by Michael. Any option that lets Claude Code merge needs a visible, honest record.

## Options

1. **Leave every pull request open.** Michael merges them one by one at the end, from the bottom of the stack. Strongest evidence, but squash merges and linear history mean every merge needs a rebase and a CI run before the next: 15+ rounds for him at the end.
2. **Integration branch.** Every change still gets its own pull request, CI, and explain-back section. Claude Code merges each one into a protected `next` branch once CI passes, labelled `ai-merged`. `main` only changes when Michael merges one `next` → `main` pull request per repository, after reading a decision report.
3. **Claude Code merges to `main` directly.** Fastest, but no human would review anything before it reached `main` or a release, and GitHub would show Michael merging unreviewed work.

## Decision

Option 2.

- `next` has the same protection as `main`: pull request required, the same required checks, linear history, applied to admins, no force pushes.
- Pull requests into `next` are squash-merged by Claude Code only after every required check passes. Each gets the `ai-merged` label.
- At the end of a milestone, Claude Code opens `next` → `main` with a review guide and a standalone HTML report of every decision and why it mattered. Michael merges it with **rebase merge**, so each change stays a separate commit on `main`.
- Releases (tags, GitHub Releases) are made from `main` only, after Michael's merge. Release candidates (`-rc.N`) may be tagged on `next` so dependent work can proceed; they are marked as pre-releases.
- Decisions Claude Code makes along the way are recorded as ADRs with `Status: drafted by Claude Code, awaiting Michael's review`, and listed in the report.

## Consequences

- Individual changes are no longer reviewed by a human before they are merged into `next`. They are reviewed as a batch before reaching `main`. The build log and every `ai-merged` label say so.
- CI (tests, the canary suite once it exists, CodeQL) is the gate for each individual change, so its strength matters more than before.
- The review at the end is larger. The HTML report, the per-change pull requests and their "If asked in an interview" sections are there to keep it manageable.
- Michael can return to per-change review at any time by saying so; the protections on `main` never changed.
