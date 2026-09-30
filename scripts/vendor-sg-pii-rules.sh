#!/usr/bin/env bash
# Vendors a tagged release of sg-pii-rules (ADR 0004 in that repo) and
# verifies every file against the release's SHA256SUMS.
# Usage: scripts/vendor-sg-pii-rules.sh v0.1.0-rc.1
set -euo pipefail
TAG="${1:?usage: vendor-sg-pii-rules.sh <tag>}"
DEST="$(cd "$(dirname "$0")/.." && pwd)/vendor/sg-pii-rules"
BASE="https://raw.githubusercontent.com/makoydev/sg-pii-rules/${TAG}"

rm -rf "$DEST" && mkdir -p "$DEST/schema" "$DEST/fixtures"
curl -fsSL "$BASE/SHA256SUMS" -o "$DEST/SHA256SUMS"
curl -fsSL "$BASE/LICENSE" -o "$DEST/LICENSE"
while read -r _ file; do
  curl -fsSL "$BASE/$file" -o "$DEST/$file"
done < "$DEST/SHA256SUMS"

(cd "$DEST" && shasum -a 256 -c SHA256SUMS)
COMMIT="$(gh api "repos/makoydev/sg-pii-rules/commits/${TAG}" -q .sha 2>/dev/null || echo unknown)"
cat > "$DEST/SOURCE.md" <<MD
# Vendored: sg-pii-rules

| | |
|---|---|
| Upstream | <https://github.com/makoydev/sg-pii-rules> |
| Release | \`${TAG}\`, commit \`${COMMIT}\` |
| Licence | Apache-2.0 ([LICENSE](LICENSE)) |

Every file listed in \`SHA256SUMS\` is copied unchanged from the release, and a test verifies the sums, so a hand edit fails CI. Vetted's implementation of the rules is \`src/pipeline/pii.ts\`; it must pass every case in \`fixtures/\` (the conformance suite).

To update: \`scripts/vendor-sg-pii-rules.sh <tag>\`, then run the tests.
MD
echo "vendored sg-pii-rules ${TAG} (${COMMIT:0:7})"
