#!/usr/bin/env bash
set -euo pipefail

BASE="${1:-https://api.shuttlegate.app}"
ADMIN_KEY="${ADMIN_API_KEY:-}"

echo "=== Smoke test: $BASE ==="

HEALTH=$(curl -s "$BASE")
echo "Health: $HEALTH"

if [ -n "$ADMIN_KEY" ]; then
  echo "=== Admin cash-outs pending ==="
  curl -s "$BASE/admin/cashouts?status=pending" -H "Authorization: Bearer $ADMIN_KEY" | python3 -m json.tool || true
else
  echo "ADMIN_API_KEY not set; skipping admin endpoint check."
fi

echo "=== Smoke test complete ==="
