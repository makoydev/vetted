# 0007. Read config from the base ref; pull_request trigger only

Status: drafted by Claude Code, awaiting Michael's review
Date: 2026-09-28

## Context

Vetted's behaviour is set by `.vetted.yml` (paths, budget, and later suppressions). If a pull request can edit that file and have the edit apply to its own review, it can switch off scrubbing or silence findings. Separately, `pull_request_target` runs with repository secrets in the context of untrusted fork code, a well-known source of compromised workflows.

## Options

1. **Config from the pull request head.** Simple, but a pull request can weaken its own review.
2. **Config from the base ref** (the target branch as it was before the pull request). Config changes take effect only after they are reviewed and merged.
3. For forks: **`pull_request_target`**, to give fork pull requests the API key. Rejected outright.

## Decision

Option 2, on the `pull_request` trigger only. Vetted reads the diff through the REST API and never checks out or runs the pull request's code. Pull requests from forks receive no secrets on this trigger, so they run on the mock model and say so in the audit artifact.

## Consequences

- A config change needs one merged pull request before it has any effect. That is the point.
- Outside contributors on forks get no real model review. That's acceptable for a single-maintainer pilot, and `EVALS.md` says so.
