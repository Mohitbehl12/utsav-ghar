#!/bin/sh
# Runs every end-to-end suite, each against a fresh throw-away database (never your real data).
#   sh server/test/run-e2e.sh            (from the repo root, after `npm run install:all` and `npm run build`)
# Suites that place guest orders need --guest-checkout; the legal suite needs it off.
set -e
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
TMP=$(mktemp -d)
export DB_PATH="$TMP/test.db" UPLOAD_DIR="$TMP/uploads" TEST_MODE=on PORT=${PORT:-4000}
export JWT_SECRET=${JWT_SECRET:-e2e-$(od -An -tx1 -N16 /dev/urandom | tr -d ' \n')} ADMIN_JWT_SECRET=${ADMIN_JWT_SECRET:-e2e-admin-$(od -An -tx1 -N16 /dev/urandom | tr -d ' \n')}
export DATA_ENCRYPTION_KEY=${DATA_ENCRYPTION_KEY:-e2e-enc-$(od -An -tx1 -N16 /dev/urandom | tr -d ' \n')} COURIER_WEBHOOK_SECRET=${COURIER_WEBHOOK_SECRET:-e2e-courier-$(od -An -tx1 -N8 /dev/urandom | tr -d ' \n')}
PID=""
start() {
  if [ -n "$PID" ]; then kill "$PID" 2>/dev/null; wait "$PID" 2>/dev/null || true; fi
  rm -rf "$TMP/test.db"* "$TMP/uploads"
  (cd "$ROOT/server" && node src/seed.js --demo $1 >/dev/null)
  (cd "$ROOT/server" && exec node src/index.js > "$TMP/server.log" 2>&1) & PID=$!
  i=0; until curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; do i=$((i+1)); [ $i -gt 60 ] && { cat "$TMP/server.log"; exit 1; }; sleep 0.5; done
}
FAILED=0
for t in e2e e2e-security e2e-dealer e2e-pricing e2e-dealer-products e2e-support e2e-crm e2e-compliance; do
  start --guest-checkout
  if node "$ROOT/server/test/$t.mjs" "http://127.0.0.1:$PORT" > "$TMP/$t.log" 2>&1; then echo "✔ $t ($(grep -c '✔' "$TMP/$t.log") checks)"; else echo "✘ $t"; tail -20 "$TMP/$t.log"; FAILED=1; fi
done
start ""
if node "$ROOT/server/test/e2e-legal.mjs" "http://127.0.0.1:$PORT" > "$TMP/e2e-legal.log" 2>&1; then echo "✔ e2e-legal ($(grep -c '✔' "$TMP/e2e-legal.log") checks)"; else echo "✘ e2e-legal"; tail -20 "$TMP/e2e-legal.log"; FAILED=1; fi
kill "$PID" 2>/dev/null
exit $FAILED
