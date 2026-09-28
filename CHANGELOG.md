# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Project scaffold from the `actions/typescript-action` template on the `node24`
  runtime, with a `mode` input (`shadow`, `opt-in`) that fails closed on unknown
  values ([#1](https://github.com/makoydev/vetted/issues/1)).
- CI: format, lint, tests, `dist/` freshness check, and a job that runs the
  action itself. CodeQL for TypeScript and workflow files. All third-party
  Actions pinned by commit SHA and kept current by Dependabot.
- `CLAUDE.md` working rules and the Milestone 1 plan in `docs/M1-PLAN.md`.
