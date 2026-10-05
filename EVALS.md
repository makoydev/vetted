# Evaluation (v0, Milestone 1)

Measured on 2026-09-30 for v0.1.0 on Node 24.21.0 (Apple-silicon Mac for local numbers, GitHub-hosted `ubuntu-latest` for CI numbers). Each section names the command or run that reproduces it and states its limits. **No real-model numbers exist yet:** `OPENAI_API_KEY` isn't set, so every review so far used the mock model (§8).

## 1. Canary suite: does anything leak? (`npm run canary`)

17 synthetic pull requests carry **144 canary values**:

- fake secrets from 29 providers, including ones in a deleted line, a hunk header, a `.env` file, a `.pem` file, and a file over the size cap;
- synthetic NRICs (valid and mistyped), phone numbers and emails;
- injection payloads in comments, role markers, hidden characters, a file name, and a request to print a key.

Each PR runs twice, in shadow mode and in opt-in mode against a **hostile model that echoes everything it received**. Every canary is searched for in 4 output channels: the model request, logs and outputs, the audit record, and posted comments.

| Result                                            | Value  |
| ------------------------------------------------- | ------ |
| Runs                                              | 34     |
| Canary checks                                     | 144    |
| **Leaks**                                         | **0**  |
| Injection pull requests with the payload detected | 6 / 6  |
| Clean pull requests with a false injection alarm  | 0 / 11 |

**The suite can fail.** With each protection removed on purpose, it reported:

| Protection removed  | Leaks reported |
| ------------------- | -------------- |
| All scrubbers       | 165            |
| PII scrubber only   | 71             |
| Path deny list only | 3              |

**Limits:** the canaries are formats Vetted is designed to catch. The suite proves the pipeline delivers what the detectors find, end to end, in every channel. It doesn't prove the detectors find everything (§2, §3).

## 2. Secret scrubbing

**Runtime-generated secrets** (`npm test`): fake secrets for 29 common providers are all found and fully redacted, including multi-line private keys.

**Parity with the real gitleaks 8.30.1 binary** (`npm run parity:gitleaks`, decoding off, since Vetted doesn't decode):

| Corpus                                | Cases | gitleaks findings | Vetted findings | Found by gitleaks only |
| ------------------------------------- | ----- | ----------------- | --------------- | ---------------------- |
| gitleaks' own test strings            | 3,658 | 405               | 470             | **0**                  |
| Real third-party source files (10 MB) | 2,028 | 2                 | 2               | **0**                  |

All 65 extra Vetted findings are explained:

- 60 are gitleaks' "generic filter", which drops a duplicate on a line another rule already covers. The redaction is the same.
- 2 are on lines marked `gitleaks:allow`, which Vetted ignores on purpose (ADR 0010).
- 3 are in a tar archive, which gitleaks skips as binary and Vetted never receives.

**Entropy backstop calibration** (`npm run measure:entropy`, 2,000 random tokens per row, 28.4 MB of real third-party code). Vetted uses a 4.3 threshold and a 32-character minimum:

| Random secret                    | Caught at 4.3 |
| -------------------------------- | ------------- |
| 32-character base64              | 97%           |
| 32-character alphanumeric        | 96%           |
| 32-character lower-case + digits | 42%           |
| 40+ characters, any of the above | 84–100%       |

False positives: **15 per MB** of real code, mostly inline base64 source maps, which are safe to redact.

**Limits:** gitleaks' decoding of base64-encoded secrets isn't implemented. Low-entropy secrets that no rule names aren't caught unless they're in a denied file.

## 3. Personal-data scrubbing

- **Conformance** (`npm test`): **184 / 184** sg-pii-rules cases pass with Vetted's own implementation (NRIC 53, NRIC_LIKE 46, PHONE 41, EMAIL 44).
- **Behaviour on real code** (sg-pii-rules `EVALS.md`, 16 MB of third-party JavaScript):
  - `EMAIL` fired 7.7 times per MB, and every hit was email-shaped.
  - `PHONE` fired 40.5 times per MB, **all on bare eight-digit numeric constants** such as `67108864` (2²⁶). In code, a constant will sometimes reach the model as `<PHONE>`. That costs context, never data.

**Limits:** the fixtures are a specification, not labelled real-world data. Synthetic data flatters rule-based detectors. Names, addresses, card numbers and dates of birth aren't detected in v0.1.

## 4. Prompt-injection detection

- **Unit tests:** 12 payloads across 5 rules are detected; 6 ordinary lines (lint directives, `approve()` functions, `systemPrompt` variables) stay quiet.
- **Canary suite:** 6 of 6 injection pull requests are detected, and none of the 11 clean ones raise an alarm.
- **A real pull request** (Vetted's own #21, CI run 36697544953): 7 detections, all on the intentional attack examples in Vetted's own test files.

**Limits:** these are pattern rules. Paraphrased or novel injections will get past them. That's why the design doesn't depend on detection: the model has no tools and can only produce advisory comments.

## 5. Cost bound (`src/model/pricing.ts`, `src/model/budget.ts`)

|                                                                                                                                  | Value                                                     |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Worst case per review (60,000-byte diff cap + prompt, 8,000 output tokens, `gpt-6-luna` at US$0.10 / US$0.50 per million tokens) | **US$0.0104**                                             |
| Paid reviews allowed per day at the default US$0.20 budget                                                                       | **19**                                                    |
| Worst case per repository per month                                                                                              | **at most US$6.20** (US$0.20 × 31 days)                   |
| Worst case for the two piloted repositories                                                                                      | at most US$12.40 a month, within the brief's US$20 target |

These are **upper bounds by construction**, not measurements. Real per-review cost will be measured once the key is set.

## 6. Pilot (single maintainer)

Measured on 2026-10-05 from Vetted's own audit artifacts (one per run), downloaded from the Discreet repository and totalled; for pull requests reviewed more than once, the latest run counts.

| Repository                   | Pull requests reviewed                                                           | Runs | Mode   | Model | Comments posted | Cost |
| ---------------------------- | -------------------------------------------------------------------------------- | ---- | ------ | ----- | --------------- | ---- |
| `discreet`                   | 12 of 13 (#1–#12; #13 opened in opt-in mode, unlabelled, so skipped as designed) | 37   | shadow | mock  | 0 (shadow)      | US$0 |
| `vetted` (dogfood, from #22) | from #22 onwards                                                                 |      | shadow | mock  | 0 (shadow)      | US$0 |

What Vetted did with Discreet's 12 pull requests before anything reached the model:

|                                             | Count                                                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Files in the pull requests / sent / skipped | 139 / 130 / 9 (8 over the size cap, mostly vendored test fixtures; 1 on the default deny list) |
| Bytes sent (after scrubbing)                | 373,676                                                                                        |
| Secret-shaped strings scrubbed              | 18 (15 high-entropy, 3 generic API keys), all synthetic test keys in Discreet's tests          |
| Personal data scrubbed                      | 89 (44 `PHONE`, 39 `NRIC`, 3 `EMAIL`, 3 `NRIC_LIKE`), all synthetic test values                |
| Prompt-injection findings                   | 0                                                                                              |

**Reading this honestly.**

- **Sample size:** 12 pull requests, one maintainer, mock model only (`OPENAI_API_KEY` isn't set), so there are no review-quality, acceptance or override numbers yet. What the pilot does show is the pre-send pipeline working on a real, changing codebase.
- **A gap the pilot exposed:** Vetted vendors sg-pii-rules **v0.1.0**, which doesn't know the card, postal code, unit number and date-of-birth rules added in v0.2.0 for Discreet. Discreet's synthetic test values of those kinds were therefore sent to the mock model unscrubbed. Nothing real was sent and no paid model was involved; upgrading Vetted to v0.2.0 is Milestone 3 work.
- Some `PHONE` hits are probably eight-digit test constants rather than phone numbers, the false positive documented in sg-pii-rules ADR 0007.
- Discreet switches to opt-in on 2026-10-14 (makoydev/discreet#13). Milestone 3's dashboard reports acceptance, overrides and cost per pull request.

## 7. Speed

A real run on Vetted's own PR #21 (16 changed files; 12 sent, 54,437 bytes) took **841 ms in total**, including all GitHub API calls, with the mock model. The sg-pii-rules reference scans about 3.1 MB/s. The developer quickstart (`npm ci && npm run all` on a fresh clone) took 22 s.

## 8. Not yet measured

- **`gpt-6-luna` vs `gpt-5-nano`** on the same pull requests (ADR 0003's "cheapest model that works" check). This needs `OPENAI_API_KEY`. Procedure: set the key, run Vetted in shadow mode on the same pull requests with `model: gpt-6-luna` and then `model: gpt-5-nano`, and compare findings by hand. It moves to "Next" in the README.
- Real review quality (acceptance rate, false positives as judged by a human): Milestone 3.
- The optional replay over about 50 historical pull requests of an open-source repository: Milestone 3, if time allows.
