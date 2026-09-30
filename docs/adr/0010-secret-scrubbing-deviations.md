# 0010. How Vetted applies gitleaks' rules, and where it deliberately differs

Status: drafted by Claude Code, awaiting Michael's review
Date: 2026-09-30

## Context

ADR 0005 chose gitleaks' default rules, run by `re2js`. Research into gitleaks v8.30.1's source showed that copying its behaviour exactly would, in a few places, let a secret through. That's acceptable for a scanner that reports findings to a human; it isn't acceptable for a filter that decides what leaves the building.

## Options

1. **Exact replica** of gitleaks' semantics, quirks included. Easy to defend ("same as gitleaks"), but inherits the leaks below.
2. **Use the rules, but be stricter wherever gitleaks' behaviour would let a secret through**, and document each difference with a test.
3. **Write our own rules.** Rejected in ADR 0005.

## Decision

Option 2. Vetted runs all 221 text rules from `config/gitleaks.toml` (v8.30.1, SHA-256 checked) with gitleaks' keyword prefilter, match trimming, secret-group extraction, entropy formula and allowlists, except:

| #   | Difference                                               | Why                                                                                                                                               |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Inline `gitleaks:allow` comments are ignored             | The diff is untrusted. Its author must not be able to exempt a secret from scrubbing, just as a pull request can't edit its own config (ADR 0007) |
| D2  | Each allowlist regex is tested on its own                | gitleaks joins them into one pattern, so a leading `(?i)` on the first spreads to the rest and allowlists strings it shouldn't                    |
| D3  | The global regex `(?i)^true                              | false                                                                                                                                             | null$`is corrected to`(?i)^(?:true | false | null)$` | As written it allowlists any secret that merely _contains_ "false". A test fails if upstream ever changes the regex, so the correction can be removed |
| D4  | The whole match is redacted, not only gitleaks' "secret" | For some rules the "secret" is a small part of the credential: 5 characters of a 204-character webhook URL                                        |
| D5  | Allowlists never trust file paths, only text             | A path allowlist would exempt files that Vetted does send; a combined path-and-text allowlist is treated as never matching                        |

Not implemented: gitleaks' decoding of base64/hex/percent-encoded text (Vetted's own entropy check catches long encoded strings), commit allowlists (no commits in a diff), and composite rules (unused by the default config; the converter fails if they appear). The one path-only rule (`pkcs12-file`) is covered by the path deny list.

An **entropy backstop** catches secrets no rule names: runs of 32 or more base64-style characters with Shannon entropy above 4.3. Calibrated with `npm run measure:entropy`: it catches 96–97% of random 32-character tokens and 100% of 40+ character ones, at about 15 false positives per MB of real JavaScript, mostly inline base64 source maps that are safe to redact. Hex strings (SHAs, checksums) can't exceed 4.0 and never match.

## Consequences

- Measured with `npm run parity:gitleaks` against the real gitleaks 8.30.1 binary (decoding off):
  - **On gitleaks' own 3,658 test strings, gitleaks found nothing that Vetted missed.** Vetted found 65 more: 60 where gitleaks' generic filter hides a duplicate finding on a line another rule already covers (same redaction), 2 on lines marked `gitleaks:allow` (D1), and 3 in a tar archive that gitleaks skips as binary (Vetted never receives binary files).
  - **On 2,028 real third-party source files (10 MB), both found exactly the same 2 things.**
- Vetted may redact slightly more than gitleaks would report. The cost is a placeholder instead of a value, never a leak.
- Updating gitleaks is a deliberate pull request: new file, new checksum, re-run the parity check.
