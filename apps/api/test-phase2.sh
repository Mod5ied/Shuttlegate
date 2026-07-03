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

npm run dev -- --port 8787 >/tmp/shuttlegate-api-phase2.log 2>&1 &
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

echo "=== Register driver ==="
api_post '/auth/register' "{\"name\":\"Driver\",\"phone\":\"$DRIVER_PHONE\",\"role\":\"driver\"}" "" "$(uuid)" | python3 -m json.tool

echo "=== Register student ==="
api_post '/auth/register' "{\"name\":\"Student\",\"phone\":\"$STUDENT_PHONE\",\"role\":\"student\"}" "" "$(uuid)" | python3 -m json.tool

echo "=== OTP driver ==="
api_post '/auth/otp/request' "{\"phone\":\"$DRIVER_PHONE\"}" "" "$(uuid)" | cat
sleep 1
DRIVER_CODE=$(grep -o "OTP for $DRIVER_PHONE: [0-9]*" /tmp/shuttlegate-api-phase2.log | tail -1 | grep -o '[0-9]*$')
DRIVER_TOKEN=$(api_post '/auth/otp/verify' "{\"phone\":\"$DRIVER_PHONE\",\"code\":\"$DRIVER_CODE\"}" "" "$(uuid)" | extract_token)
echo "Driver token: ${DRIVER_TOKEN:0:40}..."

echo "=== OTP student ==="
api_post '/auth/otp/request' "{\"phone\":\"$STUDENT_PHONE\"}" "" "$(uuid)" | cat
sleep 1
STUDENT_CODE=$(grep -o "OTP for $STUDENT_PHONE: [0-9]*" /tmp/shuttlegate-api-phase2.log | tail -1 | grep -o '[0-9]*$')
STUDENT_TOKEN=$(api_post '/auth/otp/verify' "{\"phone\":\"$STUDENT_PHONE\",\"code\":\"$STUDENT_CODE\"}" "" "$(uuid)" | extract_token)
echo "Student token: ${STUDENT_TOKEN:0:40}..."

echo "=== Top up student wallet (₦1,000 = 1000 points) ==="
TOPUP=$(api_post '/wallet/topup/initiate' '{"amount_fiat":100000}' "$STUDENT_TOKEN" "$(uuid)")
echo "$TOPUP" | python3 -m json.tool
TX_REF=$(echo "$TOPUP" | python3 -c "import sys,json; print(json.load(sys.stdin)['payment_link'].split('tx_ref=')[1].split('&')[0])")
curl -s -X POST "$BASE/wallet/topup/webhook" -H 'Content-Type: application/json' -d "{\"event\":\"charge.completed\",\"data\":{\"tx_ref\":\"$TX_REF\",\"status\":\"successful\",\"amount\":1000}}" | python3 -m json.tool

echo "=== Student balance before ==="
api_get '/wallet/balance' "$STUDENT_TOKEN" | python3 -m json.tool

echo "=== Driver creates temporary session ==="
TEMP_SESSION=$(api_post '/session/create' '{"type":"temporary","fare_points":50,"capacity":4}' "$DRIVER_TOKEN" "$(uuid)")
echo "$TEMP_SESSION" | python3 -m json.tool
TEMP_SESSION_ID=$(echo "$TEMP_SESSION" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "=== Student scans temporary session ==="
api_post '/payment/scan' "{\"session_id\":\"$TEMP_SESSION_ID\"}" "$STUDENT_TOKEN" "$(uuid)" | python3 -m json.tool

echo "=== Student balance after temporary payment ==="
api_get '/wallet/balance' "$STUDENT_TOKEN" | python3 -m json.tool

echo "=== Driver balance after temporary payment ==="
api_get '/wallet/balance' "$DRIVER_TOKEN" | python3 -m json.tool

echo "=== Driver creates long-running session (capacity 2) ==="
LR_SESSION=$(api_post '/session/create' '{"type":"long_running","fare_points":100,"capacity":2}' "$DRIVER_TOKEN" "$(uuid)")
echo "$LR_SESSION" | python3 -m json.tool
LR_SESSION_ID=$(echo "$LR_SESSION" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "=== Student scans long-running session twice (should settle batch) ==="
api_post '/payment/scan' "{\"session_id\":\"$LR_SESSION_ID\"}" "$STUDENT_TOKEN" "$(uuid)" | python3 -m json.tool
# Small sleep to let first queue message process before second (sequential queue)
sleep 1
api_post '/payment/scan' "{\"session_id\":\"$LR_SESSION_ID\"}" "$STUDENT_TOKEN" "$(uuid)" | python3 -m json.tool

echo "=== Wait for queue consumer to settle batch ==="
sleep 3

echo "=== Student balance after batch ==="
api_get '/wallet/balance' "$STUDENT_TOKEN" | python3 -m json.tool

echo "=== Driver balance after batch ==="
api_get '/wallet/balance' "$DRIVER_TOKEN" | python3 -m json.tool

echo "=== Transaction history (student) ==="
api_get '/payment/history' "$STUDENT_TOKEN" | python3 -m json.tool

echo "=== Driver creates another long-running session (capacity 4) and student scans once ==="
LR2_SESSION=$(api_post '/session/create' '{"type":"long_running","fare_points":100,"capacity":4}' "$DRIVER_TOKEN" "$(uuid)")
echo "$LR2_SESSION" | python3 -m json.tool
LR2_SESSION_ID=$(echo "$LR2_SESSION" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
api_post '/payment/scan' "{\"session_id\":\"$LR2_SESSION_ID\"}" "$STUDENT_TOKEN" "$(uuid)" | python3 -m json.tool
sleep 1

echo "=== Driver closes & settles batch early ==="
curl -s -X POST "$BASE/session/$LR2_SESSION_ID/close" -H "Authorization: Bearer $DRIVER_TOKEN" -H "Idempotency-Key: $(uuid)" | python3 -m json.tool

echo "=== Student balance after close & settle ==="
api_get '/wallet/balance' "$STUDENT_TOKEN" | python3 -m json.tool

echo "=== Driver balance after close & settle ==="
api_get '/wallet/balance' "$DRIVER_TOKEN" | python3 -m json.tool

echo "=== Transaction history (driver) ==="
api_get '/payment/history' "$DRIVER_TOKEN" | python3 -m json.tool

echo "=== Phase 2 tests passed ==="
