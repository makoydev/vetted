# Vendored: gitleaks default rules

| | |
|---|---|
| Upstream | <https://github.com/gitleaks/gitleaks> |
| Release | `v8.30.1` (2026-03-21), commit `83d9cd684c87d95d656c1458ef04895a7f1cbd8e` |
| File | `config/gitleaks.toml`, SHA-256 `e163e53b9e7e8a8511e77271e2b323ed057759542a6d988258afe3a1fa329caf` |
| Licence | MIT, Copyright (c) 2019 Zachary Rice ([LICENSE](LICENSE)) |

`gitleaks.toml` and `LICENSE` are copied unchanged. `rules.json` is generated from `gitleaks.toml` by `npm run vendor:gitleaks` (a reshape only). `SHA256SUMS` covers all three; a test verifies it, so a hand edit fails CI.

How Vetted applies these rules, and where it deliberately differs from gitleaks, is in [ADR 0010](../../docs/adr/0010-secret-scrubbing-deviations.md).

To update: download the new release's `config/gitleaks.toml` and `LICENSE` here, update `SOURCE` in `scripts/vendor-gitleaks.ts`, run `npm run vendor:gitleaks`, and run the tests.
