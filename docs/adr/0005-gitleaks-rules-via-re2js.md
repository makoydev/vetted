# 0005. Secret scrubbing with gitleaks' rules executed by re2js

Status: drafted by Claude Code, awaiting Michael's review
Date: 2026-09-28

## Context

Secrets must be removed from the diff before it reaches a model. The gitleaks default rule set is widely recognised and MIT-licensed. Its patterns are written for Go's RE2 engine; JavaScript's regex engine has different syntax and semantics (for example, a leading `(?i)` flag and backtracking behaviour).

## Options

1. **Run the gitleaks binary** inside the action. Exact behaviour, but it downloads and executes a binary at runtime, which is another supply-chain step to verify.
2. **Translate the rules to JavaScript regexes.** Subtle behaviour differences, and a translation layer to maintain.
3. **Vendor the rule file at a pinned gitleaks tag and run it with `re2js`**, a pure-JavaScript port of RE2, plus a Shannon-entropy check for secrets that no rule names.

## Decision

Option 3, provisionally. The rule file, its licence and a `SHA256SUMS` file live in `vendor/gitleaks/`; CI fails if the checksum changes without a matching update. If `re2js` proves unable to compile the rule set during issue #4, this ADR is revisited in favour of option 1 with a checksum-verified binary.

## Consequences

- Same regex semantics as gitleaks itself, no native code, no runtime download.
- The entropy threshold will produce false positives (hashes, IDs). Hard-negative fixtures measure this and `EVALS.md` reports it.
- Rule updates are explicit pull requests that bump the pinned tag.
