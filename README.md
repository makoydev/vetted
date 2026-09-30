# Vetted

**Governed, advisory AI code review for GitHub Actions.** Vetted removes secrets and Singapore personal data from a pull request's diff before an AI model sees it, reports prompt-injection attempts instead of obeying them, and posts comments that are clearly labelled as AI advice. It never approves, requests changes or merges: a human decides.

> **Status: v0.1.0 released on 2026-10-01** after human review. 408 unit tests and a 34-run canary suite pass (0 leaks). Reviews use a free mock model until an OpenAI key is configured. Not yet on the Marketplace (Milestone 3).

## Why

Teams want AI help with code review but can't send credentials or customer data to a model provider, can't let text hidden in a diff steer the model, can't let the model approve anything, and can't roll it out blind. Vetted treats each of those as a control with evidence ([`CONTROLS.md`](CONTROLS.md)).

## What happens on each pull request

1. **Gate.** Shadow mode reviews every pull request but only writes an audit record. Opt-in mode reviews pull requests labelled `ai-review` and comments. Fork pull requests and runs without a key use the mock.
2. **Path rules and size caps.** `.env*`, keys, credential files, lockfiles, generated code and binaries are never sent. Oversized files are skipped whole and listed.
3. **Scrubbing.** gitleaks' 221 secret rules (run by RE2, with five deliberate, stricter differences), an entropy check for unnamed secrets, and Singapore NRIC/FIN (including mistyped ones), phone and email detection from [`sg-pii-rules`](https://github.com/makoydev/sg-pii-rules). Values become `<SECRET:rule>`, `<NRIC>`, `<PHONE>` and so on.
4. **Budget guard.** Each review has a hard worst-case cost; a day's worst case must fit the daily budget, or the mock is used.
5. **Model call.** The diff is wrapped in markers with a random nonce and labelled untrusted. The model has no tools and must answer in a strict JSON schema; `store: false`.
6. **Validation and injection detection.** Output that doesn't match the schema is discarded. Rule-based detection reports injection attempts as `[Vetted]` findings, even when the model's output is unusable.
7. **Comments** (opt-in only), always as `COMMENT`, tagged `[AI]`, with a disclosure footer showing model, version, tokens, cost and what was redacted.
8. **Audit record** for every run, uploaded as a workflow artifact: hashes and counts, never diff text.

## Quickstart: use it (5 minutes)

1. Add `.github/workflows/vetted.yml` to your repository:

   ```yaml
   name: Vetted
   on:
     pull_request:
       types: [opened, synchronize, reopened, labeled]
   permissions:
     contents: read # read the diff and config
     pull-requests: write # post comments (never approve)
     actions: read # count today's runs for the budget guard
   jobs:
     review:
       runs-on: ubuntu-latest
       steps:
         - uses: makoydev/vetted@v0.1.0 # for production, pin the release's full commit SHA instead
           with:
             mode: shadow # start here; switch to opt-in later
             openai-api-key: ${{ secrets.OPENAI_API_KEY }} # optional: without it, the mock is used
   ```

2. Open a pull request. The "Vetted review" check runs, and its run page shows an audit summary and a `vetted-audit-…` artifact.
3. Optional, for real reviews: create an OpenAI project with a monthly spend limit, then add its key as the `OPENAI_API_KEY` repository secret yourself.
4. When shadow results look useful, switch to `mode: opt-in` and add the `ai-review` label to pull requests you want reviewed.
5. Optional: add `.vetted.yml` to your default branch to change the model, budget, limits or paths. See [`.vetted.yml`](.vetted.yml) and [`src/schema/config.schema.json`](src/schema/config.schema.json). An invalid file fails the run and sends nothing.

## Quickstart: develop (verified on a fresh clone in 22 seconds)

```sh
git clone https://github.com/makoydev/vetted.git && cd vetted
npm ci            # Node 24 (see .nvmrc)
npm run all       # format, lint, 408 tests, 34-run canary suite, bundle
npm run canary    # just the canary suite: expect "canary leaks: 0"
npm run parity:gitleaks -- node_modules 10   # optional, needs `brew install gitleaks`
```

## Evidence

| Document                                                                                             | What it shows                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`CONTROLS.md`](CONTROLS.md)                                                                         | 18 features mapped to IMDA's GenAI and Agentic AI frameworks, PDPA and PDPC guidelines, OWASP LLM Top 10 2025, IMDA's LLM Starter Kit, CSA, NIST and ISO controls, with graded sources and known gaps |
| [`THREAT_MODEL.md`](THREAT_MODEL.md)                                                                 | 13 threats, their mitigations and residual risk                                                                                                                                                       |
| [`EVALS.md`](EVALS.md)                                                                               | Canary results (0 leaks, and it fails when a protection is removed), parity with gitleaks, entropy calibration, cost bound, pilot, limitations                                                        |
| [`docs/adr/`](docs/adr)                                                                              | 12 decisions, with the options rejected                                                                                                                                                               |
| [`docs/HOW-THIS-WAS-BUILT.md`](docs/HOW-THIS-WAS-BUILT.md)                                           | How AI assistance was governed, and every mistake it made and how each was caught                                                                                                                     |
| [`RISKS.md`](RISKS.md) · [`CHANGELOG.md`](CHANGELOG.md) · [`docs/CV-NUMBERS.md`](docs/CV-NUMBERS.md) | Risk register, changes, headline numbers                                                                                                                                                              |

## Next

Deliberately left for later, with the reason:

- **Real-model evaluation** (`gpt-6-luna` vs `gpt-5-nano`): needs the OpenAI key, which only Michael sets.
- **Metrics branch and dashboard** (acceptance, overrides, cost per pull request), **default-on mode**, **suppressions with expiry**, **Marketplace listing**: Milestone 3, as planned.
- **Incident playbook, policy template, pilot plan**: Milestone 3 documents.
- **Decoding base64-encoded secrets** (gitleaks does this): the entropy check covers long encoded strings for now.
- **One review per push** instead of a new review each run: fine for opt-in, to be revisited with the dashboard.

## Licence

[Apache-2.0](LICENSE). Vendored rules keep their licences: gitleaks (MIT, [`vendor/gitleaks/LICENSE`](vendor/gitleaks/LICENSE)) and sg-pii-rules (Apache-2.0).
