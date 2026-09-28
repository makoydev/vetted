# 0002. TypeScript JavaScript action on node24

Status: drafted by Claude Code, awaiting Michael's review
Date: 2026-09-28

## Context

GitHub supports three kinds of action: JavaScript, Docker container and composite. Vetted calls the GitHub and model APIs and transforms text; it runs no build tools. GitHub removed Node 20 from hosted runners on 23 September 2026, so JavaScript actions must declare `node24`.

## Options

1. **JavaScript action in TypeScript**, bundled to `dist/` from GitHub's `actions/typescript-action` template.
2. **Docker action** (any language). Slower cold start because the image is pulled or built every run, a larger surface to pin and scan, and Linux runners only.
3. **Composite action** of shell steps. Hard to unit-test, and string handling in shell is where scrubbing bugs would hide.

## Decision

Option 1, from the official template (commit `57b9acc`), on `node24`. `dist/` is committed because runners execute it directly; CI rebuilds it and fails if it differs from the reviewed source.

## Consequences

- Fast start, runs on every runner OS, and the template is recognisable to reviewers.
- Committed `dist/` makes pull requests larger. It is marked `linguist-generated`, so GitHub collapses it in diffs.
- Rollup bundles dependencies, so their licences travel inside `dist/`; a licence check is on the M3 list.
