#!/usr/bin/env bash
# CPU profile of the API under load: starts a second, profiled API on :3202 (same QA database and
# secrets as the stack), runs the normal visit mix at 900 VUs for 2 minutes, stops it and summarises.
#   tests/load/profile.sh            (after tests/support/qa-stack.sh up and node seed/seed.cjs)
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
OUT="$DIR/results/raw/profile"
PORT=3202
mkdir -p "$OUT"
set -a; . "$DIR/.qa/qa.env"; set +a
cd "$DIR" && node load/make-users.cjs > /dev/null
# Exit on SIGINT so that --cpu-prof writes its file (the API has no signal handler of its own).
echo 'process.on("SIGINT", () => process.exit(0));' > "$OUT/exit-on-sigint.cjs"
(cd "$ROOT/backend" && NODE_ENV=test PORT=$PORT DATABASE_URL="postgresql://qa:${QA_DB_PASSWORD}@localhost:5433/flowforge_qa" \
  FRONTEND_URL="http://localhost:5300" GOOGLE_REDIRECT_URI="http://localhost:$PORT/api/auth/google/callback" \
  JWT_ACCESS_SECRET="$QA_JWT_SECRET" COOKIE_SECRET="$QA_COOKIE_SECRET" ADMIN_BOOTSTRAP_EMAILS=qa.admin@nst.rishihood.edu.in \
  AUTH_DEV_LOGIN_ENABLED=true AUTH_LOGIN_RATE_LIMIT_PER_MINUTE=10000 AUTH_REFRESH_RATE_LIMIT_PER_MINUTE=10000 \
  nohup node -r "$OUT/exit-on-sigint.cjs" --cpu-prof --cpu-prof-dir="$OUT" dist/main.js > "$OUT/api.log" 2>&1 &)
for _ in $(seq 1 30); do curl -sf "http://localhost:$PORT/api/auth/dev-login/accounts" > /dev/null && break; sleep 1; done
set +e
k6 run -e PROFILE=normal -e API="http://localhost:$PORT/api" --stage 30s:900,90s:900 load/flowforge.js > "$OUT/k6.log" 2>&1
set -e
kill -INT "$(lsof -ti "tcp:$PORT" -sTCP:LISTEN)"
sleep 5
node load/cpu-profile.cjs "$(ls -t "$OUT"/*.cpuprofile | head -1)"
