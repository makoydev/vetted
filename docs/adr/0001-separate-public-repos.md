# 0001. One public repository per component

Status: drafted by Claude Code, awaiting Michael's review
Date: 2026-09-28

## Context

The toolkit has four parts: Vetted (a GitHub Action), Discreet (a Go gateway), shared Singapore PII detectors, and a landing page. The GitHub Marketplace requires an action's `action.yml` at the root of a repository that contains a single action. On a free personal account, branch protection is only available on public repositories. The process (issues, pull requests, board) is part of what the portfolio shows.

## Options

1. **Monorepo** with all four parts. One place to look, but the action cannot be listed on the Marketplace from a subfolder, and one CI setup has to serve TypeScript and Go.
2. **Separate public repos**: `vetted`, `discreet`, `sg-pii-rules`, `makoydev.github.io`, tied together by one GitHub Project board.
3. **Private repos until release.** Hides unfinished work, but loses branch protection and makes the history look staged.

## Decision

Option 2. Each repo is public from its first commit and linked to the "AI Governance Toolkit" project board. `sg-pii-rules` is consumed as a tagged release that the other repos vendor and checksum.

## Consequences

- Marketplace listing is possible without restructuring.
- Cross-repo changes (a new detector) need two pull requests: one in `sg-pii-rules`, one to bump the vendored version. That friction is intentional; it makes rule changes visible and reviewed.
- The board, not a single repo, is the programme view.
