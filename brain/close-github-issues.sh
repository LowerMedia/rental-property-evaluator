#!/usr/bin/env bash
# Migrate the 12 open GitHub issues to Jira (RPE) and close them on GitHub.
# All work is now tracked in https://lowermedia.atlassian.net/ project RPE.
# Requires: gh CLI authed against LowerMedia/rental-property-evaluator.
# Bash 3.2 compatible (macOS default shell) - no associative arrays.
set -euo pipefail

REPO="LowerMedia/rental-property-evaluator"

# Tag marking the pre-1.0.0 state these issues belonged to (idempotent).
gh label create "0.0.1-beta" --repo "$REPO" \
  --color "ededed" --description "Pre-1.0.0 beta; superseded by the 1.0.0 refactor" 2>/dev/null || true
gh label create "migrated-to-jira" --repo "$REPO" \
  --color "5319e7" --description "Tracked in Jira project RPE" 2>/dev/null || true

# issue:epic mapping (for the closing comment)
MAP="2:RPE-E0 (CI/CD)
17:RPE-E1 (golden-number unit tests)
54:RPE-E1 (decimal input handling)
50:RPE-E2 (reset fixed by controlled inputs)
53:RPE-E3 (URL share)
49:RPE-E3 (PDF export)
18:RPE-E4 (amortization + graph)
3:RPE-E4 (data graphing)
46:RPE-E6 (SEO)
47:RPE-E6 (ad slots)
56:RPE-E6 (calc API)
48:RPE-E6 (calc API)"

count=0
while IFS=':' read -r n epic; do
  [ -z "$n" ] && continue
  echo "Closing #$n -> $epic"
  gh issue edit "$n" --repo "$REPO" --add-label "0.0.1-beta,migrated-to-jira"
  gh issue close "$n" --repo "$REPO" --reason "not planned" \
    --comment "Migrated to Jira: $epic in project RPE (https://lowermedia.atlassian.net/). This beta-era issue is superseded by the 1.0.0 refactor (engine rewrite + Vite/React18/TS). Tracking continues in Jira."
  count=$((count + 1))
done <<EOF
$MAP
EOF

echo "Done. Closed $count issues."
