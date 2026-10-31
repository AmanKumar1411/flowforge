# FlowForge QA suites

End-to-end, concurrency, security, accessibility, resilience and load tests. They run only against an
isolated QA stack, never the dev database (5432/flowforge) or `flowforge_test`. Results and the bug
list are in [docs/testing/report.md](../docs/testing/report.md); the plan is in
[docs/testing/plan.md](../docs/testing/plan.md).

## Stack

`support/qa-stack.sh up` starts:

| Part | Where |
| --- | --- |
| PostgreSQL 18 container `flowforge-qa-db` (`pg_stat_statements`, `max_connections=200`) | `localhost:5433/flowforge_qa` |
| Compiled API as a cluster (`node dist/cluster.js`, `API_WORKERS` processes, default 4; `NODE_ENV=test`, test login on, `TRUST_PROXY=loopback`) | `http://localhost:3200/api` |
| Web build (`vite build --mode test`, so it may keep the test-login form) served by `vite preview` | `http://localhost:5300` |

Secrets for this stack are generated once into `tests/.qa/qa.env` (git-ignored) and never printed.
`QA_LOAD=1` raises the sign-in and refresh limits to 10,000/min for the functional suites, which
sign in hundreds of users at once. Without it, the API runs with the real limits (600 sign-ins per
IP per minute, 10 refreshes per session), as the Phase 10 load runs do. Submission and write
limits are always real. Counters are shared through the database, so an API a test boots for
itself shares them too. The seed is feedback-only like the API (`EVALUATION_MARKS_ENABLED` is off);
`QA_MARKS=1 node seed/seed.cjs` seeds marks and scales as well.

## Commands

```sh
cd tests && npm install && npx playwright install chromium firefox webkit   # once; k6: brew install k6
QA_LOAD=1 ./support/qa-stack.sh up        # start (or restart) the stack
node seed/seed.cjs                        # 3,022 users, 8 projects, 780 teams; TRUNCATEs flowforge_qa only
./run-all.sh                              # every functional suite, reseeding before each
LOAD=1 ./run-all.sh                       # plus the four k6 profiles (~2 h)
```

One suite at a time (reseed first):

| Suite | Command |
| --- | --- |
| Security (P0) | `npx playwright test --project=security` |
| Concurrency (P1) | `npx playwright test --project=concurrency --workers=1` |
| Lifecycle on a real clock, desktop (P0, ~17 min) | `npx playwright test --project=desktop-chrome e2e/lifecycle.spec.ts --workers=1` |
| Elective faculty (P0) | `npx playwright test --project=desktop-chrome e2e/elective.spec.ts` |
| Student journey: Chrome 1440, Chrome 375, Firefox, WebKit (P0/P2) | `npx playwright test --project=chrome-journey --project=mobile-chrome --project=firefox --project=webkit` |
| axe and keyboard-only (P2) | `npx playwright test --project=a11y --workers=1` |
| Database restart, slow 3G (P2) | `npx playwright test --project=resilience --workers=1` |
| Data integrity (P2) | `node support/integrity.cjs` |
| Load (P1) | `./load/run.sh smoke|normal|peak|spike|soak|campus`, then `node support/charts.cjs <profiles>` and `node load/tables.cjs <profiles>`. `campus` is the peak through `load/campus-proxy.cjs`: every request from one IP in `X-Forwarded-For`, and no student may be rate limited |
| CPU profile of the API under load (second API on :3202, ~3 min) | `./load/profile.sh` |
| Summaries | `node support/summarize.cjs results/raw/<suite>.json` |

`./support/qa-stack.sh down` stops the API and web server; `destroy` also removes the database container.
