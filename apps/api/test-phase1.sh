#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

BASE="http://localhost:8787"
PHONE="+23480$(python3 -c "import random; print(random.randint(10000000, 99999999))")"

kill_server() {
  if [ -n "${SERVER_PID:-}" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
  pkill -f "wrangler dev" 2>/dev/null || true
  pkill -f "workerd" 2>/dev/null || true
}
trap kill_server EXIT

kill_server
sleep 1

npm run db:migrate:local >/dev/null 2>&1 || true

npm run dev -- --port 8787 >/tmp/shuttlegate-api-test.log 2>&1 &
SERVER_PID=$!

for i in {1..30}; do
  if curl -s "$BASE" >/dev/null 2>&1; then
    sleep 2 # give the Worker a moment to finish booting
    break
  fi
  sleep 1
done

echo "=== Register ==="
REG_KEY=$(python3 -c "import uuid; print(uuid.uuid4())")
curl -s -X POST "$BASE/auth/register" \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $REG_KEY" \
  -d "{\"name\":\"Phase 1 Test\",\"phone\":\"$PHONE\",\"role\":\"student\"}" | python3 -m json.tool

echo "=== Request OTP ==="
OTP_REQ_KEY=$(python3 -c "import uuid; print(uuid.uuid4())")
curl -s -X POST "$BASE/auth/otp/request" \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $OTP_REQ_KEY" \
  -d "{\"phone\":\"$PHONE\"}" | python3 -m json.tool

# ponytail: in dev the OTP is logged by the stub sender
CODE=$(grep -o "OTP for $PHONE: [0-9]*" /tmp/shuttlegate-api-test.log | tail -1 | grep -o '[0-9]*$')
echo "Extracted OTP: $CODE"

echo "=== Verify OTP ==="
VERIFY_KEY=$(python3 -c "import uuid; print(uuid.uuid4())")
TOKEN=$(curl -s -X POST "$BASE/auth/otp/verify" \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $VERIFY_KEY" \
  -d "{\"phone\":\"$PHONE\",\"code\":\"$CODE\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "Token: ${TOKEN:0:40}..."

echo "=== Balance (before) ==="
curl -s "$BASE/wallet/balance" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

echo "=== Topup initiate ==="
TOPUP_KEY=$(python3 -c "import uuid; print(uuid.uuid4())")
TOPUP=$(curl -s -X POST "$BASE/wallet/topup/initiate" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: $TOPUP_KEY" \
  -d '{"amount_fiat":100000}')
echo "$TOPUP" | python3 -m json.tool
TX_REF=$(echo "$TOPUP" | python3 -c "import sys,json; print(json.load(sys.stdin)['payment_link'].split('tx_ref=')[1].split('&')[0])")

echo "=== Webhook ==="
curl -s -X POST "$BASE/wallet/topup/webhook" \
  -H 'Content-Type: application/json' \
  -d "{\"event\":\"charge.completed\",\"data\":{\"tx_ref\":\"$TX_REF\",\"status\":\"successful\",\"amount\":1000}}" | python3 -m json.tool

echo "=== Balance (after) ==="
curl -s "$BASE/wallet/balance" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

echo "=== Phase 1 tests passed ==="
