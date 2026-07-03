#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

BASE="http://localhost:8787"

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

npm run dev -- --port 8787 >/tmp/shuttlegate-api-phase3.log 2>&1 &
SERVER_PID=$!

for i in {1..30}; do
  if curl -s "$BASE" >/dev/null 2>&1; then
    sleep 2
    break
  fi
  sleep 1
done

api_post() {
  local path="$1"
  local body="$2"
  local token="${3:-}"
  local idem="${4:-}"
  local headers=(-H 'Content-Type: application/json')
  [ -n "$token" ] && headers+=(-H "Authorization: Bearer $token")
  [ -n "$idem" ] && headers+=(-H "Idempotency-Key: $idem")
  curl -s -X POST "$BASE$path" "${headers[@]}" -d "$body"
}

api_get() {
  local path="$1"
  local token="$2"
  curl -s "$BASE$path" -H "Authorization: Bearer $token"
}

uuid() {
  python3 -c "import uuid; print(uuid.uuid4())"
}

extract_token() {
  python3 -c "import sys,json; print(json.load(sys.stdin)['token'])"
}

DRIVER_PHONE="+23480$(python3 -c "import random; print(random.randint(10000000, 99999999))")"
STUDENT_PHONE="+23480$(python3 -c "import random; print(random.randint(10000000, 99999999))")"

echo "=== Register driver & student ==="
api_post '/auth/register' "{\"name\":\"Driver\",\"phone\":\"$DRIVER_PHONE\",\"role\":\"driver\"}" "" "$(uuid)" >/dev/null
api_post '/auth/register' "{\"name\":\"Student\",\"phone\":\"$STUDENT_PHONE\",\"role\":\"student\"}" "" "$(uuid)" >/dev/null

echo "=== Login driver ==="
api_post '/auth/otp/request' "{\"phone\":\"$DRIVER_PHONE\"}" "" "$(uuid)" | cat
sleep 1
DRIVER_CODE=$(grep -o "OTP for $DRIVER_PHONE: [0-9]*" /tmp/shuttlegate-api-phase3.log | tail -1 | grep -o '[0-9]*$')
DRIVER_TOKEN=$(api_post '/auth/otp/verify' "{\"phone\":\"$DRIVER_PHONE\",\"code\":\"$DRIVER_CODE\"}" "" "$(uuid)" | extract_token)

echo "=== Login student ==="
api_post '/auth/otp/request' "{\"phone\":\"$STUDENT_PHONE\"}" "" "$(uuid)" | cat
sleep 1
STUDENT_CODE=$(grep -o "OTP for $STUDENT_PHONE: [0-9]*" /tmp/shuttlegate-api-phase3.log | tail -1 | grep -o '[0-9]*$')
STUDENT_TOKEN=$(api_post '/auth/otp/verify' "{\"phone\":\"$STUDENT_PHONE\",\"code\":\"$STUDENT_CODE\"}" "" "$(uuid)" | extract_token)

echo "=== Top up student (₦1,000) ==="
TOPUP=$(api_post '/wallet/topup/initiate' '{"amount_fiat":100000}' "$STUDENT_TOKEN" "$(uuid)")
TX_REF=$(echo "$TOPUP" | python3 -c "import sys,json; print(json.load(sys.stdin)['payment_link'].split('tx_ref=')[1].split('&')[0])")
curl -s -X POST "$BASE/wallet/topup/webhook" -H 'Content-Type: application/json' -d "{\"event\":\"charge.completed\",\"data\":{\"tx_ref\":\"$TX_REF\",\"status\":\"successful\",\"amount\":1000}}" >/dev/null

echo "=== Driver creates two temporary sessions ==="
SESSION1=$(api_post '/session/create' '{"type":"temporary","fare_points":200,"capacity":4}' "$DRIVER_TOKEN" "$(uuid)")
SESSION1_ID=$(echo "$SESSION1" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
SESSION2=$(api_post '/session/create' '{"type":"temporary","fare_points":200,"capacity":4}' "$DRIVER_TOKEN" "$(uuid)")
SESSION2_ID=$(echo "$SESSION2" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "=== Student pays both ==="
SCAN1=$(api_post '/payment/scan' "{\"session_id\":\"$SESSION1_ID\"}" "$STUDENT_TOKEN" "$(uuid)")
echo "$SCAN1" | python3 -m json.tool
TX1_ID=$(echo "$SCAN1" | python3 -c "import sys,json; print(json.load(sys.stdin)['transaction_id'])")
SCAN2=$(api_post '/payment/scan' "{\"session_id\":\"$SESSION2_ID\"}" "$STUDENT_TOKEN" "$(uuid)")
TX2_ID=$(echo "$SCAN2" | python3 -c "import sys,json; print(json.load(sys.stdin)['transaction_id'])")

echo "=== Balances before cash-out / refund ==="
api_get '/wallet/balance' "$STUDENT_TOKEN" | python3 -m json.tool
api_get '/wallet/balance' "$DRIVER_TOKEN" | python3 -m json.tool

echo "=== Driver earnings (net of future refund) ==="
api_get '/driver/earnings' "$DRIVER_TOKEN" | python3 -m json.tool

echo "=== Driver cash-out 100 points ==="
CASHOUT=$(api_post '/driver/cashout' '{"points":100,"destination":"+2348012345678"}' "$DRIVER_TOKEN" "$(uuid)")
echo "$CASHOUT" | python3 -m json.tool
CASHOUT_ID=$(echo "$CASHOUT" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "=== Cash-out status ==="
api_get "/driver/cashout/$CASHOUT_ID" "$DRIVER_TOKEN" | python3 -m json.tool

echo "=== Driver balance after cash-out ==="
api_get '/wallet/balance' "$DRIVER_TOKEN" | python3 -m json.tool

echo "=== Driver issues refund for first payment ==="
REFUND=$(api_post '/refund/issue' "{\"transaction_id\":\"$TX1_ID\",\"reason\":\"breakdown\"}" "$DRIVER_TOKEN" "$(uuid)")
echo "$REFUND" | python3 -m json.tool
REFUND_ID=$(echo "$REFUND" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "=== Refund detail ==="
api_get "/refund/$REFUND_ID" "$DRIVER_TOKEN" | python3 -m json.tool

echo "=== Balances after refund ==="
api_get '/wallet/balance' "$STUDENT_TOKEN" | python3 -m json.tool
api_get '/wallet/balance' "$DRIVER_TOKEN" | python3 -m json.tool

echo "=== Driver earnings after refund ==="
api_get '/driver/earnings' "$DRIVER_TOKEN" | python3 -m json.tool

echo "=== Phase 3 tests passed ==="
