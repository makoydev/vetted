# Vendored: sg-pii-rules

| | |
|---|---|
| Upstream | <https://github.com/makoydev/sg-pii-rules> |
| Release | `v0.1.0`, commit `e2554a610520cdb8e11433a53a09deb215888aa2` |
| Licence | Apache-2.0 ([LICENSE](LICENSE)) |

Every file listed in `SHA256SUMS` is copied unchanged from the release, and a test verifies the sums, so a hand edit fails CI. Vetted's implementation of the rules is `src/pipeline/pii.ts`; it must pass every case in `fixtures/` (the conformance suite).

To update: `scripts/vendor-sg-pii-rules.sh <tag>`, then run the tests.
