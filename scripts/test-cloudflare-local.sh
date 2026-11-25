#!/usr/bin/env bash
set -euo pipefail

PORT="$(printenv P27_CLOUDFLARE_TEST_PORT || true)"
if [[ -z "$PORT" ]]; then PORT=8787; fi
LOG_FILE="$(mktemp)"
SERVER_PID=""

cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -f "$LOG_FILE"
}
trap cleanup EXIT

npx --yes wrangler@4 d1 migrations apply p27-world --local >/dev/null
npx --yes wrangler@4 dev --local --ip 127.0.0.1 --port "$PORT" --log-level error >"$LOG_FILE" 2>&1 &
SERVER_PID=$!

BASE_URL="http://127.0.0.1:$PORT"
READY=0
for _ in $(seq 1 45); do
  if curl --silent --fail "$BASE_URL/readyz" >/dev/null; then
    READY=1
    break
  fi
  sleep 1
done
if [[ "$READY" -ne 1 ]]; then
  cat "$LOG_FILE"
  echo "Cloudflare local Worker did not become ready" >&2
  exit 1
fi

curl --silent --show-error --fail "$BASE_URL/health" >/dev/null

LOCAL_PROFILE_KEY="11111111-1111-4111-8111-111111111111"
PROOF_SECRET="$(printf 'a%.0s' {1..64})"
PAYLOAD="$(printf '{"localProfileKey":"%s","localProofSecret":"%s"}' "$LOCAL_PROFILE_KEY" "$PROOF_SECRET")"

FIRST="$(curl --silent --show-error --fail \
  -H 'content-type: application/json' \
  -d "$PAYLOAD" "$BASE_URL/api/player-identities/reserve")"
SECOND="$(curl --silent --show-error --fail \
  -H 'content-type: application/json' \
  -d "$PAYLOAD" "$BASE_URL/api/player-identities/reserve")"

node --input-type=module - "$FIRST" "$SECOND" <<'NODE'
import assert from "node:assert/strict";
const first = JSON.parse(process.argv[2]);
const second = JSON.parse(process.argv[3]);
assert.equal(first.reserved, true);
assert.equal(first.alreadyReserved, false);
assert.match(first.playerId, /^FRP-\d{6}$/);
assert.equal(second.accountId, first.accountId);
assert.equal(second.playerId, first.playerId);
assert.equal(second.alreadyReserved, true);
NODE

VERIFIED="$(curl --silent --show-error --fail \
  -H 'content-type: application/json' \
  -d "$PAYLOAD" "$BASE_URL/api/player-identities/verify-local-proof")"
node --input-type=module - "$VERIFIED" <<'NODE'
import assert from "node:assert/strict";
const result = JSON.parse(process.argv[2]);
assert.equal(result.verified, true);
assert.match(result.playerId, /^FRP-\d{6}$/);
NODE

BAD_SECRET="$(printf 'b%.0s' {1..64})"
BAD_PAYLOAD="$(printf '{"localProfileKey":"%s","localProofSecret":"%s"}' "$LOCAL_PROFILE_KEY" "$BAD_SECRET")"
STATUS="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  -H 'content-type: application/json' \
  -d "$BAD_PAYLOAD" "$BASE_URL/api/player-identities/verify-local-proof")"
test "$STATUS" = "401"

echo "Cloudflare local D1 identity integration: PASS"
