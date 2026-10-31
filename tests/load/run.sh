#!/usr/bin/env bash
# Runs one k6 profile against the QA stack with monitoring, then saves pg_stat_statements and API errors.
#   tests/load/run.sh smoke|normal|peak|spike|soak
# Before: tests/support/qa-stack.sh up with QA_LOAD=1 (raised sign-in limits), and node tests/seed/seed.cjs.
set -euo pipefail
PROFILE="${1:?profile}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$DIR/results/load"
mkdir -p "$OUT" "$DIR/results/raw"
cd "$DIR"
node load/make-users.cjs > /dev/null
psql_qa() { docker exec flowforge-qa-db psql -U qa -d flowforge_qa "$@"; }
psql_qa -qtA -c "SELECT pg_stat_statements_reset()" > /dev/null
BEFORE=$(psql_qa -tA -c 'SELECT count(*) FROM "Submission"')
API_LOG_LINES=$(wc -l < .qa/api.log)
node load/monitor.cjs "$OUT/$PROFILE-monitor.csv" &
MONITOR=$!
trap 'kill $MONITOR 2>/dev/null || true' EXIT
set +e
K6_WEB_DASHBOARD=true K6_WEB_DASHBOARD_EXPORT="$OUT/$PROFILE-k6-report.html" K6_WEB_DASHBOARD_PORT=-1 \
  k6 run -e PROFILE="$PROFILE" --summary-export "$OUT/$PROFILE-summary.json" load/flowforge.js > "$DIR/results/raw/$PROFILE-k6.log" 2>&1
K6_EXIT=$?
set -e
kill $MONITOR 2>/dev/null || true
AFTER=$(psql_qa -tA -c 'SELECT count(*) FROM "Submission"')
psql_qa -A -F$'\t' -c "SELECT calls, round(total_exec_time::numeric) AS total_ms, round(mean_exec_time::numeric, 2) AS mean_ms, round(max_exec_time::numeric) AS max_ms, rows, left(regexp_replace(query, '\s+', ' ', 'g'), 220) AS query FROM pg_stat_statements WHERE dbid = (SELECT oid FROM pg_database WHERE datname = 'flowforge_qa') ORDER BY total_exec_time DESC LIMIT 15" > "$OUT/$PROFILE-pg-statements.tsv"
tail -n +"$((API_LOG_LINES + 1))" .qa/api.log | sed 's/\x1b\[[0-9;]*m//g' | grep -E "ERROR|Error" | sed -E 's/^.*(ERROR|Error)/\1/' | cut -c1-200 | sort | uniq -c | sort -rn | head -20 > "$OUT/$PROFILE-api-errors.txt" || true
echo "{\"profile\":\"$PROFILE\",\"k6_exit\":$K6_EXIT,\"submissions_before\":$BEFORE,\"submissions_after\":$AFTER}" > "$OUT/$PROFILE-db.json"
echo "k6 exit $K6_EXIT; submissions +$((AFTER - BEFORE))"
