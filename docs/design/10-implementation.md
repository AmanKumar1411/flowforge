# 10 · Working implementation

## 10.1 Run it locally with demo data

You need Node.js 22.12 or newer, and Docker. Dev login stands in for Google, so no Google credentials are needed.

```bash
# 1. The database
cp infra/.env.example infra/.env        # then choose a password in infra/.env
docker compose -f infra/docker-compose.yml up -d

# 2. The API, with demo accounts and a seeded project
cd backend
cp .env.example .env                    # then set DATABASE_URL's password, and fill JWT_ACCESS_SECRET and COOKIE_SECRET
                                        # with two values from: openssl rand -base64 48
npm ci
npm run prisma:generate
npm run prisma:migrate:deploy
npm run seed:demo
npm run start:dev                       # http://localhost:3000/api, Swagger at /api/docs

# 3. The web app, in another terminal
cd frontend
cp .env.example .env
echo "VITE_DEV_LOGIN=true" > .env.development.local
npm ci
npm run dev                             # open http://localhost:5173 (localhost, not 127.0.0.1)
```

The login page lists the demo accounts. `npm start` in `backend/` runs the compiled API as a cluster, after `npm run build`.

**Where in the code:** `README.md`, `backend/.env.example`, `backend/prisma/seed.ts`, `infra/docker-compose.yml`

## 10.2 Evidence

### The system

| What | Where | Checked |
| --- | --- | --- |
| Web app | https://flowforge.edgeaman.workers.dev | Answered 200 on 6 November 2026 |
| API health | https://flowforge-api-sngq.onrender.com/api/health | Answered `{"status":"ok","database":"ok"}` on 6 November 2026. The first request after idling can take over 40 seconds, while the free instance wakes |

The web app is a Cloudflare Worker that serves the build and forwards `/api/*` to the API, so the browser sees one site (`frontend/worker/index.ts`, `frontend/wrangler.jsonc`).

### Test suites

From the final run on `lld-complete`, on 6 November 2026. The backend suites ran again after the 503 fix. The frontend, browser and QA suites ran just before it, and the fix only changes how one database error is answered.

| Suite | Command | Result |
| --- | --- | --- |
| Backend typecheck | `npm run typecheck` | Pass |
| Backend lint, with the layering rule | `npm run lint` | Pass |
| Backend build | `npm run build` | Pass |
| Backend unit (Jest) | `npm test` | 477 passed in 33 files |
| Backend integration (`node:test`, real PostgreSQL) | `npm run test:integration` | 644 passed in 33 files |
| Frontend unit (Vitest) | `npm test` in `frontend/` | 68 passed in 16 files |
| Frontend build and lint | `npm run build`, `npm run lint` | Pass |
| Browser checks (Chrome against the real API) | `e2e/browser/README.md` | 73 of 73 checks in 7 scripts |

The integration count includes the 62 contract tests (31 per implementation) in `backend/test/contracts/`. The first regression on this branch found 5 integration failures, all from one cause: three Phase 10 tests hard-coded early-November dates in `FixedClock`, sessions last a day, and the test browser drops a cookie that has expired by real time. They now start from the real date (`nextMinute` in `backend/test/support/schedule.ts`). No test was weakened.

### QA suites

An isolated stack: the compiled API as a 4-worker cluster, its own database on port 5433, and 3,022 seeded users (`tests/README.md`).

| Suite | Result | What it covers |
| --- | --- | --- |
| Security | 58 of 58 | Tokens, IDOR across 46 routes, roles, mass assignment, injection, XSS, links, rate limits, headers, CORS, `npm audit` |
| Concurrency | 10 of 10 | Parallel submits, the last team slot, two leaders and one student, two tabs on one evaluation, double clicks, the due time, a release racing saves |
| Student journey | 6 of 6, with 6 skipped by design | Chrome 1440, Chrome 375, Firefox and WebKit. Two checks run once, on desktop Chrome, so the other three browsers skip them |
| Elective faculty | 1 of 1 | Enrolling by paste and CSV, publishing, teams and submission counts |
| Lifecycle on a real clock | 1 of 1, in 950 s | The whole project in a browser, with the deadline edges at ±1 minute |
| Accessibility | 3 of 3 | axe: 0 violations on 22 pages. Keyboard only: 11 presses to submit work, 17 to save an evaluation (513 before Phase 10) |
| Resilience | 2 of 2 | A database restart mid-session: retry banner, still signed in, no API restart. Slow 3G: loading states, and the dashboard arrives |
| Data integrity | 21 of 21 | No version gaps, double memberships, or work after a deadline, checked in SQL after the suites |

### Load

**These numbers are indicative, not proof of production capacity.** k6, the API and PostgreSQL share one M2 laptop (8 cores, 8 GB). The profile is the same in both runs: 3,000 users, a 10-minute ramp, a 20-minute hold,
and a submission rush in the last 15 minutes (`tests/load/flowforge.js`).

#### Peak: 3,000 users

| Measure | Before Phase 10 | After Phase 10 |
| --- | --- | --- |
| Code | `6166b60`, one Node process | `lld-complete`, 4 workers (`backend/src/cluster.ts`) |
| Limits | Raised to 10,000 a minute | The real ones: 600 sign-ins per IP per minute, 10 refreshes per session |
| Requests | 1,045,601 | 1,244,459 |
| Requests per second, average | 557 | 663 |
| Requests per second, best 10 s | 674 | 1,067 |
| Where latency starts to climb | About 1,250 users, 650 requests/s | Between 1,550 and 1,850 users, about 900 requests/s |
| All requests, p50 / p95 / p99 | 2.09 s / 5.94 s / 6.74 s | 1.74 s / 4.64 s / 6.79 s |
| Reads, p95 | 5.94 s | 4.65 s |
| Writes, p95 | 6.18 s | 6.07 s |
| **Target: reads under 500 ms, writes under 1 s** | **Missed** | **Still missed** |
| Failed requests | 0.0004% | 0.0021% |
| 5xx, and no response | 0, and 4 | 25, and 0 |
| Submissions: accepted, and new rows | 2,383 and 2,383 | 2,952 and 2,952 |
| Integrity checks afterwards | 21 of 21 | 21 of 21 |
| API memory, max | 651 MB | 981 MB, across 5 processes |

#### Spike: 1,500 users in 60 seconds

| Measure | Before Phase 10 | After Phase 10 |
| --- | --- | --- |
| All requests, p50 / p95 / p99 | 5 ms / 15 ms / 28 ms | 5 ms / 12 ms / 19 ms |
| Reads, p95 | 15 ms | 10 ms |
| Writes, p95 | 29 ms | 20 ms |
| Failed requests | 0% | 0% |

#### What the numbers mean

- **Capacity rose about 40%,** from about 650 to about 900 requests per second, with all 3,000 users on one IP under the real limits and no sign-in refused. **The 3,000-user latency target is still missed on this machine.** The p95 improved only from 5.94 s to 4.64 s. This run can't say what production hardware would do.
- **What limited it isn't established.** During the hold, averaged: API 215% CPU, PostgreSQL 279% (peak 516%), k6 49%, on 8 cores, with PostgreSQL in a Docker VM. The API wasn't using its 4 cores in full, and on average only 3 of 40 connections were active.
- **No work was lost or saved late:** the accepted submissions equal the new rows, and the 21 integrity checks pass.
- **25 responses were 500, since fixed to 503.** Under this load, Prisma's default 2-second wait to start a transaction expired ("Unable to start a transaction in the given time"). The requests were refused cleanly: 21 refreshes, 3 submissions and 1 sign-in. They now answer `503 SERVICE_UNAVAILABLE`, so the browser retries instead of showing a bug (`backend/src/common/errors/database-errors.ts`, proved by `backend/test/database-outage.e2e.ts`). The numbers above are from before that fix, which changes the status of these responses and not their timing; the load wasn't rerun.
- **One refresh answered 401,** with the cause not determined. The audit log shows no reuse detection in the run.
- **An earlier attempt on this branch isn't counted.** The QA script started the API with a 10-a-minute sign-in limit, so nearly every simulated user was refused. The script is fixed (`tests/support/qa-stack.sh`).

#### Not rerun

The `normal` and `soak` profiles weren't rerun after Phase 10, so their only numbers are from before it, in `docs/testing/report.md`: normal, 500 users, p95 10 ms; soak, 300 users for an hour, p95 12 ms with memory flat. The `campus` profile,
which sends every request through a proxy with one `X-Forwarded-For`, has never been run. The peak above comes from one IP too, without the proxy, and `backend/test/rate-limit.e2e.ts` tests the forwarded path without the load.

## 10.3 Design to code

Each diagram, and the files it was verified against.

| Document | Diagram | Verified against |
| --- | --- | --- |
| 1 | Use cases | `backend/src/auth/application/sign-in.service.ts`, `backend/src/course-cycles/application/course-cycle.service.ts`, `backend/src/teams/application/team-completion.service.ts`, `backend/src/common/links/link-requirement.ts` |
| 2 | Domain model, 6 figures | `backend/prisma/schema.prisma`, `backend/src/course-cycles/domain/cycle.types.ts`, `backend/src/teams/domain/team.ts`, `backend/src/ideas/domain/idea.ts`, `backend/src/submissions/domain/submission.ts`, `backend/src/evaluations/domain/evaluation.ts`, `backend/src/users/domain/user.ts` |
| 2 | Per module, 13 figures | `backend/src/auth/auth.module.ts`, `backend/src/course-cycles/course-cycles.module.ts`, `backend/src/teams/teams.module.ts`, `backend/src/ideas/ideas.module.ts`, `backend/src/submissions/submissions.module.ts`, `backend/src/evaluations/evaluations.module.ts`, `backend/src/dashboard/dashboard.module.ts`, `backend/src/admin/admin.module.ts`, and [generated/ports.md](generated/ports.md) |
| 2 | `DomainError` hierarchy | `backend/src/common/errors/domain-error.ts`, `backend/src/common/errors/api-exception.filter.ts` |
| 2 | Builders | `backend/src/course-cycles/testing/cycle.builder.ts`, `backend/src/teams/testing/team.builder.ts`, `backend/src/submissions/testing/submission.builder.ts` |
| 4 | Contract tests | `backend/test/contracts/` |
| 5 | Each pattern | The paths under each pattern in [doc 5](05-design-patterns.md) |
| 6 | Sign-in, 3 figures | `backend/src/auth/application/auth.service.ts`, `backend/src/auth/application/sign-in.service.ts`, `backend/src/auth/infrastructure/google-identity.provider.ts` |
| 6 | Refresh, 3 figures | `backend/src/auth/application/session.service.ts`, `backend/src/auth/presentation/auth.controller.ts`, `frontend/src/api/client.ts` |
| 6 | Create and publish | `backend/src/course-cycles/application/course-cycle.service.ts`, `backend/src/course-cycles/application/publish-checks.ts` |
| 6 | Form a team | `backend/src/teams/application/team-formation.service.ts`, `backend/src/teams/domain/team-rules.ts` |
| 6 | Idea rounds | `backend/src/ideas/application/idea.service.ts`, `backend/src/ideas/domain/idea-rules.ts` |
| 6 | Submit work | `backend/src/submissions/application/submission.service.ts`, `backend/src/submissions/domain/submission-rules.ts` |
| 6 | Feedback | `backend/src/evaluations/application/evaluation.service.ts`, `backend/src/evaluations/infrastructure/prisma-evaluation.repository.ts` |
| 6 | Dashboard | `backend/src/dashboard/application/dashboard.service.ts`, `backend/src/dashboard/infrastructure/modules-student-sources.ts` |
| 6 | Activity, 6 figures | `backend/src/course-cycles/domain/cycle-timeline.ts`, `backend/src/submissions/domain/submission-rules.ts`, `backend/src/auth/domain/role-resolver.ts` |
| 6 | Cycle state | `backend/src/course-cycles/domain/cycle-workflow.ts`, `backend/src/course-cycles/domain/cycle-timeline.ts` |
| 6 | Submission, idea, evaluation, team and session states | `backend/src/submissions/domain/submission-rules.ts`, `backend/src/ideas/domain/idea-rules.ts`, `backend/src/evaluations/domain/evaluation-rules.ts`, `backend/src/teams/domain/team-rules.ts`, `backend/src/auth/application/session.service.ts` |
| 7 | Layers | `backend/eslint.config.mjs`, `backend/test/layering.e2e.ts` |
| 8 | ER diagrams, 7 figures | Generated from `backend/prisma/schema.prisma` |
| 9 | Validation layers | `backend/src/main.ts`, `backend/src/common/http/body-depth.middleware.ts`, `backend/src/common/errors/api-exception.filter.ts` |

## 10.4 Confirmations

| Check | Command | Result |
| --- | --- | --- |
| The layering rule passes, and catches a planted violation | `npm run lint`, `backend/test/layering.e2e.ts` | Pass: lint is clean, and 5 of 5 in the test |
| Every port has the implementations the diagrams show | `npm run docs:ports -- --check` | Pass: 27 abstract classes; all 55 ports and production implementations are shown in doc 2 |
| The ER diagrams regenerate unchanged | `npm run docs:erd -- --check` | Pass: unchanged |
| Every cited path, excerpt and code exists | `npm run docs:check` | Pass: no problems |
| Every Mermaid block renders | `docs/design/scripts/render-mermaid.sh` | Pass: 76 of 76 |

**Recorded at:** branch `lld-complete`, commit `18163ae`, and again after the 503 fix that follows it.
