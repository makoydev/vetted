# 0008. Pull requests from Michael's account, labelled ai-drafted

Status: accepted. Drafted by Claude Code; reviewed and accepted by Michael Mendoza on 2026-09-28.
Date: 2026-09-28

## Context

Every change must go through a pull request that Michael reviews and merges. Most changes are drafted by Claude Code. GitHub does not let an account approve its own pull request, so if the drafts are opened from Michael's account, a required-approval rule would block every merge.

## Options

1. **Machine account** (such as `makoydev-claude`) opens pull requests; Michael approves; branch protection requires one approval. The strongest visible separation, with about 20 minutes of setup and a second credential to manage.
2. **Michael's account, `ai-drafted` label.** Protection requires a pull request, passing checks (lint and test, dist check, action run, CodeQL), resolved conversations and linear history, and applies to admins, with zero required approvals.
3. **Local branches only**; Michael pushes and opens every pull request himself.

## Decision

Option 2, by Michael's choice. Every AI-drafted pull request carries the `ai-drafted` label and every commit carries a `Co-Authored-By` trailer naming the model, so AI involvement is visible per change.

## Consequences

- "Michael reviews before merge" is enforced by process and by required checks, not by an approval gate. `docs/HOW-THIS-WAS-BUILT.md` states this plainly.
- Option 1 remains available if the pilot needs stronger separation; switching is a settings change plus this ADR's successor.
