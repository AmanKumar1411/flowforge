#!/usr/bin/env bash
# Runs every QA suite against the isolated stack, reseeding before each so results are independent.
#   tests/run-all.sh            functional suites (security, concurrency, e2e, browsers, a11y, resilience, integrity)
#   LOAD=1 tests/run-all.sh     also the k6 profiles normal, peak, spike, soak (about 2 hours)
set -uo pipefail
cd "$(dirname "$0")"
QA_LOAD=1 ./support/qa-stack.sh up
mkdir -p results/raw
run() { # project(s) and output name
  local name="$1"; shift
  node seed/seed.cjs > /dev/null
  QA_JSON="results/raw/$name.json" npx playwright test "$@" > "results/raw/$name.log" 2>&1
  node support/summarize.cjs "results/raw/$name.json" | tail -1 | sed "s/^/$name: /"
}
run security --project=security
run concurrency --project=concurrency --workers=1
run journey --project=chrome-journey --project=mobile-chrome --project=firefox --project=webkit
run elective --project=desktop-chrome e2e/elective.spec.ts --workers=1
run lifecycle --project=desktop-chrome e2e/lifecycle.spec.ts --workers=1
run a11y --project=a11y --workers=1
run resilience --project=resilience --workers=1
node support/integrity.cjs results/integrity.json
if [ "${LOAD:-0}" = 1 ]; then
  # One seed, then the profiles back to back: the data grows from one profile to the next, as in the report.
  node seed/seed.cjs > /dev/null
  for profile in normal peak spike soak; do ./load/run.sh "$profile"; done
  node support/integrity.cjs results/integrity-after-load.json
  node support/charts.cjs normal peak spike soak
  node load/tables.cjs normal peak spike soak > results/load/tables.md
fi
