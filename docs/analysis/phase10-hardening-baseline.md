# Phase 10 hardening: baseline and analysis

Branch `phase10-hardening`, from `phase10-qa-testing` (`12c5edc`: the QA suites and report, already on
`main`). Every finding of [the QA report](../testing/report.md) was traced to the code below before
any change. Each item lists the confirmed root cause, the planned fix and the test that must fail
before the fix and pass after it.

## Baseline (before any change)

| Suite | Result |
| --- | --- |
| Backend lint, typecheck, build | pass |
| Backend unit (Jest) | 430 / 430 (29 suites) |
| Backend integration (`node:test`, `flowforge_test`) | 522 / 522 (40 suites) |
| Frontend lint, build | pass |
| Frontend unit (Vitest) | 57 / 57 (11 files) |
| Browser e2e (`e2e/browser`, 7 scripts, one after another) | 71 / 73 checks. `student-ui` failed its two grading checks. Run alone on the same code it passes 5 / 5: `completion-ui` also uses batch 2022, and the grading locators then match more than one row. That is a test-isolation problem, fixed with the H3 update of that script |
| QA functional suites (`tests/run-all.sh`) | security 48 pass, 8 fail (the report's findings); concurrency 10 / 10; journey 6 / 6 (4 browsers; 6 skipped by design); elective 1 / 1; lifecycle 1 / 1 (937 s); a11y: axe **fail** (BUG-4, BUG-5), KEY-1 pass, KEY-2 **fail** ("focus never reached the control" within the press limit; the original QA run reached it in 513 presses); resilience: RES-1 **fail** (BUG-8), RES-2 pass |
| QA integrity (`node support/integrity.cjs`) | 21 / 21 |

## Group 1: blockers for go-live

### H1. `npm start` cannot start the built API (BUG-1)

- **Root cause:** [tsconfig.build.json](../../backend/tsconfig.build.json) has no `include` or `rootDir`.
  - It compiles `prisma.config.ts` and `prisma/seed*.ts` along with `src/`, so the common root is `backend/` and the entry point lands in `dist/src/main.js`.
  - `npm start` runs `node dist/main` ([package.json:8](../../backend/package.json)).
  - There is no health route: `GET /api/health` answers 404.
- **Fix:**
  - `include: ["src"]` and `rootDir: "src"` in the build config, so the output is `dist/main.js`. The seed keeps running through `ts-node` (`seed:demo`), and Prisma reads `prisma.config.ts` itself.
  - A public `GET /api/health` that runs `SELECT 1`: 200 `{ status: "ok" }`, or 503 when the database doesn't answer.
  - Update `tests/support/qa-stack.sh`, `tests/load/profile.sh`, `tests/security/config.spec.ts` and `tests/README.md`, which use `dist/src/main.js`.
- **Test:** `test/start.e2e.ts` runs `npm run build`, then `npm start`, waits for `GET /api/health` to answer 200, and stops the process. It fails today: `Cannot find module dist/main`.

### H2. Campus WiFi: thousands of students behind one IP

- **Root cause:**
  - Two throttlers, `login` (10/min) and `refresh` (30/min), are keyed by IP ([auth.module.ts:47-61](../../backend/src/auth/auth.module.ts), defaults at [env.validation.ts:227-240](../../backend/src/config/env.validation.ts)), with `ThrottlerGuard` on the whole controller ([auth.controller.ts:44](../../backend/src/auth/presentation/auth.controller.ts)).
  - Express's `trust proxy` is never set ([main.ts](../../backend/src/main.ts)), so behind a proxy every request has the proxy's IP. Without one, it has the NAT's IP.
  - Counters live in each process's memory (the throttler's default storage), so several processes would each allow the full limit.
- **Fix:**
  - `TRUST_PROXY` (default off; `loopback`, a hop count or a list of addresses), passed to `app.set("trust proxy", …)`. With it off, `X-Forwarded-For` is ignored, as today.
  - **Sign-in:** the `login` throttler stays per IP (Google start, callback and test login) with a campus-sized default of 600/min. A per-Google-account limit (10/min, keyed by `sub`) runs in `SignInService` once the ID token is verified; before that, the account isn't known.
  - **Refresh:** no IP limit at all. A per-family limit (default 10/min) runs in `SessionService` after the cookie's hash finds the token, keyed by its family ID. A limited refresh is `429` and keeps the cookie.
  - **Shared counters:** one PostgreSQL store implements Nest's `ThrottlerStorage` and a `RateLimiter` port, which `SessionService`, `SignInService` and `SubmissionService` use.
    - It is an `UNLOGGED` table `RateLimitCounter(key, windowStart, count, expiresAt)`, updated with one `INSERT … ON CONFLICT … DO UPDATE … RETURNING`.
    - Windows are fixed, computed from the injected `Clock`.
    - Expired rows are deleted every minute.
- **Tests** (`test/rate-limit.e2e.ts`):
  - 3,000 sign-ins from one IP, spread over 5 minutes of fake time at the 600/min default, all succeed, and the 601st inside one minute is refused. Today the 11th is refused.
  - One family refreshing 11 times in a minute is limited, while 500 other families from the same IP are not. Today the 31st refresh from the IP is refused, whichever family sends it.
  - Two API instances on one database share the counts.
  - The existing check that `X-Forwarded-For` doesn't reset the limit keeps passing.

### H3. Marks are not part of this version

- **Root cause:** marks and the scale are in every evaluation view and DTO:
  - `toTeamView` ([evaluation-views.ts](../../backend/src/evaluations/application/evaluation-views.ts));
  - `gradingView`, whose rows carry the domain `Evaluation` with `marks` ([evaluation.service.ts:62-72](../../backend/src/evaluations/application/evaluation.service.ts));
  - the dashboard's released results ([dashboard-views.ts](../../backend/src/dashboard/application/dashboard-views.ts)).
  - There is no setting to turn them off.
  - The API already lets faculty grade and release without a scale; only marks need one ([evaluation-rules.ts:108-115](../../backend/src/evaluations/domain/evaluation-rules.ts)). It is the UI that asks for "marked out of".
- **Fix:**
  - `EVALUATION_MARKS_ENABLED` (default `false`), read by `EvaluationService`. When off:
    - marks or a scale in a request → `400 MARKS_DISABLED`;
    - feedback is required;
    - every view is built without `marks` and `maxMarks` (the keys are absent, not null), including the grading rows and the dashboard.
  - The grading view gains `marksEnabled`, so the UI can show feedback only.
  - The columns stay.
  - The demo and QA seeds write feedback-only evaluations unless marks are switched on.
- **Tests:**
  - Unit tests of the rules with the flag off.
  - Integration: every existing marks test runs with the flag on; new flag-off tests sweep every route (owner, admin, member, other student) and check that no body contains `marks` or `maxMarks`.
  - QA: the "unreleased marks never reach students" sweep is extended to every route.

### H4. One process tops out at about 650 requests/s (BUG-9)

- **Root cause:**
  - [jwt-token.signer.ts:41-47](../../backend/src/auth/infrastructure/jwt-token.signer.ts) passes the secret as a string, so jsonwebtoken 9.0.3 re-parses it on every verify (17% of CPU in the QA profile).
  - About 9 queries per request: the cycle and its milestones are read more than once per request (`Milestone` 1.7 times), user names are fetched one lookup at a time, and the faculty lists read every version ([prisma-submission.repository.ts:60-66](../../backend/src/submissions/infrastructure/prisma-submission.repository.ts), also behind grading's `latestWork` in [modules-grading-sources.ts:48-57](../../backend/src/evaluations/infrastructure/modules-grading-sources.ts)).
  - One process only; the pool size is implicit (pg's default of 10) in [prisma.service.ts](../../backend/src/prisma/prisma.service.ts).
  - `log: query` events are emitted for every query in every environment, only for one test.
- **Fix:**
  1. A `KeyObject` made once in the constructor, used for sign and verify.
  2. Queries, measured endpoint by endpoint with a query listener:
     - load each cycle with its milestones once per request (a request-scoped loader);
     - batch user lookups;
     - faculty lists and grading read the latest version per team plus a count, with history on demand (`GET /teams/:id/milestones/:m/submissions?limit&before`, paged);
     - indexes only where `EXPLAIN` asks;
     - query events only when `NODE_ENV=test`.
  3. `src/cluster.ts` (`node:cluster`):
     - `API_WORKERS` (default: available CPUs);
     - a crashed worker is replaced;
     - SIGTERM drains and exits;
     - `DB_POOL_MAX` is explicit, and boot is refused when `API_WORKERS × DB_POOL_MAX > DB_MAX_CONNECTIONS − headroom`;
     - `npm start` runs the cluster, `npm run start:single` one process.
- **Tests:**
  - A unit test that the key is created once.
  - Query budgets in integration tests for the project page, the team milestone page, grading and the submissions list, written as constants (the dashboard test's style).
  - A cluster test with 2 workers: a killed worker is replaced, and the connection budget refuses a bad configuration.
  - Then the peak load profile.

### H5. Idle connections close after 5 s (BUG-10)

- **Root cause:** `bootstrap` calls `app.listen` without touching the server's timeouts ([main.ts:69-72](../../backend/src/main.ts)), so Node's 5 s `keepAliveTimeout` applies. QA measured `Keep-Alive: timeout=5`.
- **Fix:**
  - `HTTP_KEEP_ALIVE_TIMEOUT_MS` (default 65,000) set on the server in every worker;
  - `headersTimeout` 1 s above it.
- **Test:** a keep-alive connection idle for 10 s still serves a POST on the same socket. Today the socket is closed after about 5 s.

### H6. A short database outage signs everyone out (BUG-8)

- **Root cause:**
  - [auth.controller.ts:169-171](../../backend/src/auth/presentation/auth.controller.ts) clears the refresh cookie on *any* error.
  - The filter turns unknown errors, including `ECONNREFUSED` from `pg-pool`, into `500` ([api-exception.filter.ts](../../backend/src/common/errors/api-exception.filter.ts)).
  - On the client, every refresh failure counts as signed out: `postRefresh` returns an `errorCode` for 5xx and network errors ([client.ts:56-75](../../frontend/src/api/client.ts)), and `establishSession` sets `signed-out` for any `errorCode` ([AuthProvider.tsx:38-46](../../frontend/src/auth/AuthProvider.tsx)).
- **Fix:**
  - The cookie is cleared only for authentication failures (`INVALID_REFRESH_TOKEN`, `TOKEN_REVOKED`, `REFRESH_TOKEN_REUSED`, `ACCOUNT_DEACTIVATED`, `UNAUTHENTICATED`).
  - The filter maps connection-level database errors (pg and Prisma codes, socket errors) to `503 SERVICE_UNAVAILABLE`, with no details.
  - Frontend: only a 401 means signed out. On a network error or 5xx, the app keeps the user, shows "Can't reach FlowForge. Retrying…" and retries with backoff.
- **Tests:**
  - Integration: the API reaches the database through a TCP relay the test can cut. During the cut, refresh is 503 and the cookie stays; afterwards, the same cookie refreshes.
  - Vitest for the client and provider.
  - QA RES-1, which today ends on `/login`, must end signed in.

## Group 2: correctness and security

### H7. A NUL character gives 500 (BUG-2)

- **Root cause:**
  - None of the 28 free-text DTO fields (11 files) rejects control characters.
  - PostgreSQL refuses `\u0000` in `text` with error `22021`, which the filter turns into 500.
- **Fix:**
  - One decorator, `@IsCleanText()`, refuses `\u0000`–`\u001F` except tab, newline and carriage return, on every free-text field.
  - The filter maps `22021` to `400 INVALID_TEXT` as a safety net.
- **Test:**
  - A unit test walks class-validator's metadata: every `@IsString` field also has `@IsCleanText`.
  - QA SEC-INJ-4 covers every text field.

### H8. Deeply nested JSON gives 500 (BUG-3)

- **Root cause:**
  - `ValidationPipe` calls Nest's recursive `stripProtoKeys` on the body before validating (`@nestjs/common/pipes/validation.pipe.js:67`). It overflows the stack at a few thousand levels.
  - The filter logs the stack for every such request.
- **Fix:**
  - A middleware, running after body parsing and before any pipe, measures depth iteratively.
  - Above `MAX_BODY_DEPTH` (default 32), it answers `400 BODY_TOO_DEEP` and logs one line.
- **Test:** QA SEC-INJ-3 gets 400, plus an integration test that also checks no stack trace is logged.

### H9. Losing the race for a team's last slot gives 400 (BUG-7)

- **Root cause:** `assertHasRoom` throws `TEAM_SIZE_OUT_OF_RANGE` ([team-rules.ts:90-96](../../backend/src/teams/domain/team-rules.ts)). It runs after the team's row lock, so it is exactly the state conflict the race losers hit.
- **Fix:** `409 TEAM_FULL`. `TEAM_SIZE_OUT_OF_RANGE` stays for a request that is wrong on its own (`assertSize`).
- **Test:** an integration test of a full team, and QA CON-2: 1 × 200 and 9 × 409.

### H10. Unlimited write rate (SEC-F1)

- **Root cause:** `SubmissionService.submit` ([submission.service.ts:48-90](../../backend/src/submissions/application/submission.service.ts)) has no rate limit and no cap on versions. No authenticated write has a limit.
- **Fix** (through the H2 store):
  - submissions: 10 per user per milestone per minute → `429 TOO_MANY_REQUESTS`;
  - at most 50 versions per team per milestone (`SUBMISSION_VERSION_LIMIT`), checked under the team's lock → `409 VERSION_LIMIT_REACHED`;
  - a general per-user limit on other authenticated writes (`WRITE_RATE_LIMIT_PER_MINUTE`, default 60).
- **Test:**
  - QA SEC-ABUSE-1 is now limited;
  - integration tests of both limits and of a team submitting a few versions normally.

### H11. The test login could run on a staging server (SEC-F2)

- **Root cause:**
  - Boot refuses `AUTH_DEV_LOGIN_ENABLED=true` only with `NODE_ENV=production` ([env.validation.ts:195-200](../../backend/src/config/env.validation.ts)).
  - The provider checks only the flag ([dev-identity.provider.ts:35](../../backend/src/auth/infrastructure/dev-identity.provider.ts)). A server running `development` accepts the test login from anywhere.
- **Fix:**
  - Allowed with `NODE_ENV=test`.
  - With `development`, only when the TCP peer is a loopback address and the request carries no `X-Forwarded-For` or `Forwarded` header. A local proxy must not make a remote user look local.
  - Any other environment with the flag on refuses to boot.
- **Test:** a non-loopback request in development gets 404 `DEV_LOGIN_DISABLED`, and boot is refused with the flag on outside test and development.

### H12. The test-login form ships in a plain build (SEC-F7)

- **Root cause:** `frontend/.env` sets `VITE_DEV_LOGIN=true`. It is git-ignored, so only builds from a developer's checkout are affected. Nothing stops `vite build` in production mode with the flag on.
- **Fix:**
  - The flag moves to `frontend/.env.development.local` (git-ignored, documented in `.env.example`).
  - `vite.config.ts` fails a `production`-mode build with the flag on.
  - The QA stack builds its web app with `--mode test`.
- **Test:** QA SEC-AUTH-12: a production build with the flag fails, a test-mode build ships the form, and a plain build doesn't.

### H13. Links to internal addresses and links with credentials (SEC-F4, SEC-F9)

- **Root cause:**
  - `HttpsLinkValidator` accepts any https URL whose host contains a dot, so IP literals pass ([link-validators.ts:45-56](../../backend/src/common/links/link-validators.ts)). `localhost` is refused only because it has no dot.
  - No validator checks for a username or password.
  - Catalog links accept `http` ([idea-requests.dto.ts:127](../../backend/src/ideas/presentation/dto/idea-requests.dto.ts)).
- **Fix:**
  - One shared check in `common/links` refuses IP literals (v4 and v6), `localhost` and `*.localhost`, and any URL with credentials → `400 INVALID_LINK`.
  - Every validator uses it, and catalog links go through it too, `https` only.
- **Test:** unit tests of the refused and accepted lists (GitHub, Drive, Vercel, Netlify), plus QA SEC-LINK.

### H14. Two simultaneous refreshes sign the user out everywhere (SEC-F6)

- **Root cause:** a token that was already rotated, or that loses the `revokeIfActive` race, always goes to `handleReuse`, which revokes the family ([session.service.ts:106-112, 121-123](../../backend/src/auth/application/session.service.ts)).
- **Fix:**
  - `REFRESH_REUSE_GRACE_SECONDS` (default 10).
  - If the presented token was rotated within the window, a new token is issued in the same family.
  - After the window, reuse still revokes the family.
  - ADR 023 records the trade-off.
- **Test:**
  - Unit tests with a fixed clock.
  - QA SEC-AUTH-9 (two parallel refreshes) keeps the user signed in.
  - An integration test: a replay after the window still revokes.

### H15. The access token is valid for 15 minutes after sign-out (SEC-F5)

- **Root cause:** by design. Access tokens are short-lived JWTs, and only "Sign out everywhere" bumps `tokenVersion`.
- **Fix:**
  - No behaviour change. ADR 023 states it.
  - The sign-out screen adds "On a shared computer, use *Sign out everywhere*."
- **Test:** a Vitest check of the text.

## Group 3: accessibility (BUG-4, 5, 6)

### H16

- **Root cause:**
  - The coral accent `--coral: #eb775e` on `--paper: #fbfaf5` is 2.74:1 ([App.css:5-7](../../frontend/src/App.css)), and the "Draft" badge is 4.38:1.
  - Admin rows have 50 inputs and 2 selects without names ([AdminPage.tsx](../../frontend/src/pages/AdminPage.tsx)).
  - Grading needs 513 Tab presses, because every tab, team row and link comes first.
- **Fix:**
  - Darker accent and badge colours, only where text sits on them: at least 4.5:1, with the same hue.
  - `aria-label` on each admin control, naming its row's student.
  - A skip link to the main content, and "Jump to grading" links per milestone.
- **Test:** QA axe on 22 pages with no violations, and KEY-2 within a press budget.

## Where the report is wrong or the brief needs care

1. **`NODE_ENV=staging` already refuses to boot.** The config accepts only development, test and production. The real SEC-F2 gap is `development` reachable from the network, which H11's loopback rule closes. The staging test will check the reason for the refusal, not just that boot stops.
2. **SEC-F7 is narrower than it reads.** `frontend/.env` is git-ignored, so a clean checkout or CI build never had the flag. Only builds from a developer's checkout shipped the form.
3. **"About 9 queries per request"** came from the 15 most expensive statements only. H4 measures each endpoint with a query listener instead.
4. **"The scale is required to grade or release"** is true of the UI, not the API (H3).
5. **The refresh limit can't be keyed by anything in the cookie alone.** The cookie changes on every rotation, so a hash of it would be per token, not per family. The family ID comes from the token row that the cookie's hash finds, in the same read the refresh already makes.
6. **"Sign-ins per Google account (`sub`)"** can't be checked before Google answers. It is checked once the ID token is verified, so a refused attempt still costs one call to Google.
