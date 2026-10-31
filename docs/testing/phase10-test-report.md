# Phase 10 test report: hardening before go-live

Branch `phase10-hardening` (from `phase10-qa-testing`, `12c5edc`). Every finding of the
[QA report](report.md) was fixed and proved with a test that fails on the code before Phase 10 and
passes after it. The full before/after comparison, including load, is in the report's
[Phase 10 results](report.md#phase-10-results). The analysis behind each fix is in
[phase10-hardening-baseline.md](../analysis/phase10-hardening-baseline.md).

## Full regression

REGRESSION_TABLE

## Each new test fails before its fix

Each new or changed test was copied into a worktree of the baseline (`12c5edc`) and run there:

| Test | On the baseline | Item |
| --- | --- | --- |
| `test/start.e2e.ts` | fails: `dist/main.js` missing, `npm start` cannot start | H1 |
| `test/rate-limit.e2e.ts` | 7 of 11 fail: the 11th campus sign-in refused, refresh limited per IP, nothing shared between instances | H2 |
| `test/evaluations-feedback-only.e2e.ts` | 3 of 3 fail: marks accepted and returned | H3 |
| `test/query-budget.e2e.ts` | fails: grading 23 statements, submit 21, a team's submissions 16 | H4 |
| `src/auth/infrastructure/jwt-token.signer.spec.ts` | 1 of 2 fails: the string secret is passed on every call | H4 |
| `test/cluster.e2e.ts` | 2 of 2 fail: no cluster, no connection budget | H4 |
| `test/keep-alive.e2e.ts` | fails: the API closed the idle connection | H5 |
| `test/database-outage.e2e.ts` | 1 of 2 fails: 500 and the cookie cleared | H6 |
| Frontend `client.test.ts`, `AuthProvider.test.tsx` | fail: a 503 or a network error signs out | H6 |
| `test/clean-text.e2e.ts` | fails: no clean-text rule; a NUL reaches the database | H7 |
| `test/body-depth.e2e.ts` | fails: 500 with a stack overflow | H8 |
| `test/team-completion.e2e.ts` | 1 of 15 fails: a full team answers 400 | H9 |
| `test/write-limits.e2e.ts` | 3 of 3 fail: no submission or write limit, no version cap | H10 |
| `test/dev-login.e2e.ts` | 2 of 4 fail: forwarded and remote requests sign in | H11 |
| `test/boot.e2e.ts` (staging) | passes: `NODE_ENV=staging` was already refused at boot (see the analysis) | H11 |
| `test/sessions.e2e.ts` | 1 of 14 fails: two refreshes at once end the family | H14 |
| Unit specs: links, idea rules, team rules, evaluation rules, sessions, submissions, config, health | fail or do not compile against the old code | H2–H14 |
| Frontend `GradingPanel`, `TeamHistory`, `LoginPage`, `links`, `student-dashboard` tests | fail | H3, H4, H13, H15 |

## QA suites after the fixes

QA_TABLE

## Load

LOAD_SUMMARY
