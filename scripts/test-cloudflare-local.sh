#!/usr/bin/env bash
set -euo pipefail

PORT="$(printenv P27_CLOUDFLARE_TEST_PORT || true)"
if [[ -z "$PORT" ]]; then PORT=8787; fi
LOG_FILE="$(mktemp)"
FIRST_HEADERS="$(mktemp)"
SECOND_HEADERS="$(mktemp)"
SERVER_PID=""

cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -f "$LOG_FILE" "$FIRST_HEADERS" "$SECOND_HEADERS"
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

FIRST="$(curl --silent --show-error --fail -D "$FIRST_HEADERS" \
  -H 'content-type: application/json' \
  -d "$PAYLOAD" "$BASE_URL/api/player-identities/reserve")"
SECOND="$(curl --silent --show-error --fail -D "$SECOND_HEADERS" \
  -H 'content-type: application/json' \
  -d "$PAYLOAD" "$BASE_URL/api/player-identities/reserve")"

node --input-type=module - "$FIRST" "$SECOND" <<'NODE'
import assert from "node:assert/strict";
const first = JSON.parse(process.argv[2]);
const second = JSON.parse(process.argv[3]);
assert.equal(first.reserved, true);
assert.equal(first.alreadyReserved, false);
assert.equal(Object.hasOwn(first, "token"), false);
assert.equal(Object.hasOwn(first, "account"), false);
assert.match(first.playerId, /^FRP-\d{6}$/);
assert.equal(second.accountId, first.accountId);
assert.equal(second.playerId, first.playerId);
assert.equal(second.alreadyReserved, true);
NODE
echo "checkpoint: reservation JSON validated"

ACCOUNT_TOKEN="$(awk 'tolower($1) == "set-cookie:" && $2 ~ /^p27_account_session=/ { sub(/^[^=]*=/, ""); sub(/;.*/, ""); print; exit }' "$SECOND_HEADERS")"
if [[ -z "$ACCOUNT_TOKEN" ]]; then
  echo "Cloudflare local D1: account session cookie header missing." >&2
  sed -n '/^[Ss]et-[Cc]ookie:/s/=.*/=<redacted>/p' "$SECOND_HEADERS" >&2
  exit 1
fi
echo "checkpoint: session cookie extracted"
grep -Eiq '^set-cookie: p27_account_session=.*HttpOnly' "$SECOND_HEADERS"
grep -Eiq '^set-cookie: p27_account_session=.*Secure' "$SECOND_HEADERS"
grep -Eiq '^set-cookie: p27_account_session=.*SameSite=Lax' "$SECOND_HEADERS"
ME="$(curl --silent --show-error --fail \
  -H "Cookie: p27_account_session=$ACCOUNT_TOKEN" "$BASE_URL/api/accounts/me")"
node --input-type=module - "$ME" "$FIRST" <<'NODE'
import assert from "node:assert/strict";
const me = JSON.parse(process.argv[2]);
const first = JSON.parse(process.argv[3]);
assert.equal(me.account.id, first.accountId);
assert.equal(me.account.playerId, first.playerId);
assert.equal(me.account.passwordless, true);
NODE
echo "checkpoint: cookie session resumed"

curl --silent --show-error --fail \
  -X POST -H "Cookie: p27_account_session=$ACCOUNT_TOKEN" \
  "$BASE_URL/api/accounts/logout" | node --input-type=module -e '
import assert from "node:assert/strict";
let raw = "";
for await (const chunk of process.stdin) raw += chunk;
assert.equal(JSON.parse(raw).loggedOut, true);
'
echo "checkpoint: logout completed"
REVOKED_STATUS="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  -H "Cookie: p27_account_session=$ACCOUNT_TOKEN" "$BASE_URL/api/accounts/me")"
test "$REVOKED_STATUS" = "401"
echo "checkpoint: revoked cookie rejected"

VERIFIED="$(curl --silent --show-error --fail \
  -H 'content-type: application/json' \
  -d "$PAYLOAD" "$BASE_URL/api/player-identities/verify-local-proof")"
node --input-type=module - "$VERIFIED" <<'NODE'
import assert from "node:assert/strict";
const result = JSON.parse(process.argv[2]);
assert.equal(result.verified, true);
echo "checkpoint: local proof verified";
assert.match(result.playerId, /^FRP-\d{6}$/);
NODE

BAD_SECRET="$(printf 'b%.0s' {1..64})"
BAD_PAYLOAD="$(printf '{"localProfileKey":"%s","localProofSecret":"%s"}' "$LOCAL_PROFILE_KEY" "$BAD_SECRET")"
STATUS="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  -H 'content-type: application/json' \
  -d "$BAD_PAYLOAD" "$BASE_URL/api/player-identities/verify-local-proof")"
test "$STATUS" = "401"

echo "Cloudflare local D1 identity integration: PASS"
