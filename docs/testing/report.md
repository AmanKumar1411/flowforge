# FlowForge QA report: end-to-end, load, concurrency and security

Commit `6166b60` (`main`, Phases 1–9), tested 30–31 October 2026.
No application code was changed; every test lives in [`tests/`](../../tests/README.md). Plan:
[plan.md](plan.md).

## Environment (applies to every result below)

| | |
| --- | --- |
| Machine | Apple M2, 8 cores, 8 GB RAM, macOS 26.6.2. Load generator (k6), API, database and browsers share it |
| Database | PostgreSQL 18.6 in Docker (container `flowforge-qa-db`, 2 GB limit, `max_connections=200`, `pg_stat_statements`), database `flowforge_qa` on port 5433. Not the dev DB, not `flowforge_test` |
| API | Compiled build (`node dist/src/main.js`), one Node 22.14 process, `NODE_ENV=test`, test login on. Sign-in rate limits raised to 10,000/min for the functional and load runs; the rate-limit test boots its own API with the defaults (10/min, 30/min) |
| Web | Production build (`vite build`) served by `vite preview`, with the test-login form |
| Browsers | Playwright 1.64.1: Chromium 1248, Firefox 1555, WebKit 2370 |
| Data | Seed [`tests/seed/seed.cjs`](../../tests/seed/seed.cjs): 3,022 users (3 batches × 1,000 students, 20 faculty, 1 admin, 1 pending staff), 8 projects, 13 milestones, 780 teams (3,099 memberships), 750 ideas, 752 reviews, 874 submissions, 500 evaluations, 536 revisions. Reseeded before every suite |
| Login | The existing test login (`POST /auth/dev-login`), refused at boot when `NODE_ENV=production` (proved in SEC-AUTH-11) |

**Load results are indicative only.** The machine runs the load generator, the API and the database
together, and the API is one Node process. They show where the system bends first, not production
capacity.

## Summary

| Area | Passed | Failed | Blocked | Notes |
| --- | --- | --- | --- | --- |
| P0 user flows, desktop Chrome 1440 (lifecycle, elective, journey, visibility, two tabs) | 5 | 0 | 0 | Faculty wizard → close, leader, member, 8 deadline edges at ±1 minute, on a real clock |
| P0 user flows, mobile 375 / Firefox / WebKit (student journey) | 3 | 0 | 0 | No sideways scroll at 375 px |
| P0 security (56 checks) | 48 | 8 | 0 | All failures are findings below; no Critical or High |
| P1 concurrency (10 races) | 10 | 0 | 0 | No lost, duplicate or late writes |
| P1 load (4 profiles) | 3 | 1 | 0 | Normal, spike and soak meet every target. The peak (3,000 users) fails on latency: one API process tops out at about 650 requests/s (BUG-9). No 5xx, no lost or duplicate submissions. See [Load results](#load-results) |
| P2 accessibility (axe on 22 pages, 2 keyboard-only flows) | 2 | 1 | 0 | Contrast and admin labels; keyboard flows work |
| P2 resilience (DB restart, slow 3G) | 1 | 1 | 0 | A database outage signs students out for good (BUG-8) |
| P2 data integrity (21 checks, after the functional suites and again after the load) | 21 | 0 | 0 | Clean both times, including 7,924 submissions after about 2 hours of load |

## Bugs (P0 → P2)

No P0 bug was found: no data loss, no privacy leak, no broken core flow. The P1 bugs come first, then
P2; the numbers are stable IDs, not ranks.

### BUG-1 (P1) `npm start` cannot start the built API

- **Steps:** `cd backend && npm run build && npm start`.
- **Expected:** the API starts.
- **Actual:** `Error: Cannot find module '…/backend/dist/main'`. The build writes `dist/src/main.js`.
- **Evidence:** `ls backend/dist` → `prisma/ prisma.config.js src/ …`. The QA stack starts `node dist/src/main.js` instead ([qa-stack.sh](../../tests/support/qa-stack.sh)).
- **Suspected cause:** `tsconfig.build.json` has no `include`/`rootDir`, so `prisma.config.ts` and `prisma/*.ts` at the backend root are compiled too, and the output root becomes `backend/`. Any deployment that follows the `start` script fails.

### BUG-2 (P1) A NUL character in any text field gives 500 instead of 400

- **Steps:** as a student of a project in team formation, `POST /api/course-cycles/{id}/teams` with `{"name": "nul\u0000byte", "memberIds": ["{a classmate}"]}`.
- **Expected:** 400 with a validation message.
- **Actual:** `500 {"code":"INTERNAL_ERROR","message":"Unexpected server error"}`. The API log shows `PrismaClientKnownRequestError … Code: 22021 … invalid byte sequence for encoding "UTF8": 0x00` with a full stack.
- **Evidence:** SEC-INJ-4 ([input.spec.ts](../../tests/security/input.spec.ts)).
- **Suspected cause:** PostgreSQL `text` cannot hold `0x00`. The DTOs check length and blankness but not control characters, and the error filter does not map Prisma `22021`. This applies to every free-text field: names, idea text, notes, feedback.

### BUG-8 (P1) A short database outage signs out every student who loads a page during it, and they stay signed out

- **Steps:**
  1. Sign in as a student.
  2. Stop the database (`docker stop flowforge-qa-db`) and load any page.
  3. Start the database and load a page again.
- **Expected:** during the outage, a "can't reach the server, try again" message. Afterwards, the student is still signed in (the refresh cookie is valid for a day).
- **Actual:**
  - during the outage, the API answers `500 INTERNAL_ERROR` (no internals leaked) and the app shows the sign-in page with no message;
  - after recovery the API answers 200 again without a restart, but the student is still on `/login` and must sign in with Google again;
  - a write during the outage is not half-applied (the submission count is unchanged).
- **Evidence:** RES-1 ([resilience.spec.ts](../../tests/e2e/resilience.spec.ts)).
- **Suspected cause:**
  - `AuthController.refresh` clears the refresh cookie on *any* error (`catch { clearRefreshToken; throw }`), including a 500 from an unreachable database, so a transient failure becomes a sign-out;
  - the web client treats every refresh failure as signed out.
  - At a deadline peak, a database restart or failover would sign out everyone active. Clear the cookie only for auth errors (401/403 codes) and show a retry message on 5xx.

### BUG-9 (P1) At the deadline peak the API answers in 4–8 s: one process tops out at about 650 requests/s

- **Steps:** `QA_LOAD=1 ./support/qa-stack.sh up`, `node seed/seed.cjs`, `./load/run.sh peak` (3,000 users over 10 minutes, a 20-minute hold, 40% of students with open work submitting in the last 15).
- **Expected:** p95 under 500 ms for reads and 1 s for writes.
- **Actual:**
  - throughput levels off at 600–675 requests/s once about 1,250 users are active; beyond that, requests queue;
  - at 3,000 users p95 is 5.9 s for reads and 6.2 s for writes, and the faculty grading page reaches 7.6 s;
  - nothing fails: no 5xx, no timeouts, and every submission is saved exactly once (2,383 accepted by k6, 2,383 new rows).
- **Evidence:** [Load results](#load-results), files `tests/results/load/peak-*`, and a CPU profile (`./load/profile.sh`).
- **Suspected cause:** the API runs as one Node process, and its JavaScript thread is the limit, not the database.
  - During the hold, the API process sat at 110–130% CPU (one JavaScript thread plus garbage-collector threads).
  - PostgreSQL had at most 6 of the pool's 10 connections busy and spent 107 s on queries in 31 minutes.
  - The CPU profile at 900 users puts 17% of the API's busy time in `jsonwebtoken.verify`:
    - [jwt-token.signer.ts:41-47](../../backend/src/auth/infrastructure/jwt-token.signer.ts#L41-L47) passes the secret as a string, so jsonwebtoken 9.0.3 first tries to parse it as a PEM public key, fails, and falls back, on every request;
    - that costs 241 µs per verify, against 4 µs with a `KeyObject` made once.
  - 42% goes to Prisma and the `pg` driver, for about 9 queries per request.

### BUG-3 (P2) Deeply nested JSON gives 500 and a stack trace in the log for every request

- **Steps:** send a 30 KB body nested 5,000 levels deep (`{"a":{"a":…}}`) to any validated endpoint, for example `POST /api/course-cycles/{id}/teams`.
- **Expected:** 400.
- **Actual:** 500. The log shows `RangeError: Maximum call stack size exceeded at stripProtoKeys (@nestjs/common/utils/strip-proto-keys.util.js)`. The client sees only the generic message.
- **Evidence:** SEC-INJ-3. Other malformed bodies behave: malformed, array, `null`, wrong types and pollution keys get 400; 2 MB gets 413.
- **Suspected cause:** the global `ValidationPipe` walks the body recursively before validation, with no depth limit. Cheap requests that burn a full stack and a long log entry could be used to flood the logs.

### BUG-4 (P2, accessibility) Text below WCAG AA contrast on most project pages

- **Steps:** open any student or faculty project tab (Team, Idea, Milestones, Students, Teams, Ideas) and run axe.
- **Expected:** text contrast of at least 4.5:1.
- **Actual:** the orange `.eyebrow` labels and the "Rejected" status (`#eb775e` on `#fbfaf5`) are **2.74:1**; the "Draft" status badge (`#67685f` on `#e5e3d8`) is **4.38:1**. That's 31 elements on the placement panel of a project with 30 rejected ideas.
- **Evidence:** A11Y-1, [`tests/results/a11y.json`](../../tests/results/a11y.json).
- **Suspected cause:** the accent colour in `App.css` is used for small bold text.

### BUG-5 (P2, accessibility) Admin user list: 50 inputs and 2 selects without labels (axe: critical)

- **Steps:** sign in as the admin and open the home page (user list).
- **Expected:** every form control has an accessible name.
- **Actual:** each row's batch-year `<input type="number">` (`.batch-editor input`) and the role and status filters (`.panel-heading > select`, `.filters > select`) have no label. A screen reader announces "edit text, 2024" with no row context.
- **Evidence:** A11Y-1.

### BUG-6 (P2, accessibility) Grading by keyboard needs 513 Tab presses

- **Steps:** as the faculty owner of a 250-team project, open the Milestones tab and press Tab from the top until the first "Marks for …" field has focus.
- **Expected:** a skip link or heading navigation to the grading table.
- **Actual:** 513 presses, because every team's submission links come first. The flow itself works with the keyboard alone (KEY-2), and focus is visible.
- **Evidence:** KEY-2 ([keyboard.spec.ts](../../tests/e2e/keyboard.spec.ts)).

### BUG-7 (P2) Losing a race for the last team slot is reported as 400, not 409

- **Steps:** with a faculty placement open, send 10 parallel `POST /api/teams/{id}/members` requests for a team with one free slot.
- **Expected:** 1 success and 9 conflicts (409), as other races report (`STUDENT_ALREADY_IN_TEAM`, `EVALUATION_CHANGED`).
- **Actual:** 1 × 200 and 9 × `400 TEAM_SIZE_OUT_OF_RANGE`. The data is correct: the team ends with exactly 4 members.
- **Evidence:** CON-2. Clients that retry on 409 but treat 400 as "fix your input" show the wrong message.

### BUG-10 (P2) The API closes idle connections after 5 s, so a POST that races the close is dropped

- **Steps:**
  1. Open a keep-alive connection to the API and send any request. The response carries `Keep-Alive: timeout=5`.
  2. Stay idle: the API closes the connection after about 6 s (measured three times: 6,001–6,006 ms).
  3. Under load, send a POST on a pooled connection just as the API closes it.
- **Expected:** the API keeps idle connections open longer than any proxy or client in front of it (proxies typically wait 60 s), so it is never the side that closes them.
- **Actual:**
  - in the peak run, 4 requests got no status at all (`connection reset by peer`): 3 × `POST /auth/refresh` and 1 submission;
  - the submission was not saved (k6's 201 count equals the new rows), so its author would see a network error;
  - GETs hit the same race, but HTTP clients silently retry idempotent requests; they don't retry POSTs. In the first, discarded load run ([below](#load-results)), refreshes after idle pauses were far more frequent, and 68 POSTs failed the same way.
- **Evidence:** `tests/results/raw/peak-k6.log` (`Request Failed` lines), summarised by `node load/tables.cjs peak`.
- **Suspected cause:**
  - `main.ts` calls `app.listen` without setting `server.keepAliveTimeout`, so Node's default of 5 s applies.
  - Behind a load balancer with a longer idle timeout (AWS ALB and nginx default to 60 s), the balancer will reuse connections the API has just closed and answer 502.
  - Fix: set `keepAliveTimeout` above the proxy's timeout (for example 65 s), with `headersTimeout` above that.

## Security findings

No Critical or High finding. Ratings use impact on this app (university course projects, Google-only sign-in).

| ID | Rating | Finding |
| --- | --- | --- |
| SEC-F1 | Medium | **No rate limit on authenticated writes.** One member posted 100 submission versions in 0.9 s, and all were accepted (SEC-ABUSE-1). The only throttling is on sign-in and refresh. A script can fill a team's history (each version is permanent) or load the database. Suggested: a per-user limit on writes, or a cap on versions per milestone per minute. |
| SEC-F2 | Medium | **Test login runs whenever `NODE_ENV` is not `production`.** The guard refuses boot only in production (SEC-AUTH-11), so a staging server running `development` with `AUTH_DEV_LOGIN_ENABLED=true` lets anyone sign in as any user, admin included. The flag defaults to false. The prompt's rule for a test login was "only when `NODE_ENV=test`". |
| SEC-F3 | Medium (deployment) | **The web app ships with no security headers of its own.** The API sends CSP, `X-Frame-Options: SAMEORIGIN`, `nosniff` and `Referrer-Policy` (SEC-CONF-2), but the SPA's HTML comes from the static host (here `vite preview`: no CSP, no `X-Frame-Options`). Unless the production host adds them, the grading pages can be framed (clickjacking). Add a CSP with `frame-ancestors 'none'` and HSTS at the host. |
| SEC-F4 | Low | **Links to internal addresses and links with credentials are accepted.** `https://127.0.0.1/admin`, `https://169.254.169.254/latest/meta-data/`, `https://10.0.0.5:8080/` (Demo/Report) and `https://user:token@github.com/qa/repo` are all saved (201). The API never fetches links, so there is no server-side SSRF; the risk is a faculty member clicking an intranet link, or a token stored in a URL. `localhost`, `[::1]`, `http:`, `javascript:`, `data:`, `file:` and look-alike hosts are refused. |
| SEC-F5 | Low | **Sign out leaves the access token valid for up to 15 minutes.** `POST /auth/logout` ends the refresh family; the bearer token still answers 200 (SEC-AUTH-4). "Sign out everywhere" revokes both. This is common practice for short JWTs; note it for shared computers. |
| SEC-F6 | Low | **Two refreshes with the same cookie sign the user out everywhere.** Two simultaneous `POST /auth/refresh` with one cookie: the second is treated as reuse (`REFRESH_TOKEN_REUSED`) and the family is revoked, so the winner's next refresh gets `TOKEN_REVOKED` (SEC-AUTH-9). The web app serialises refreshes across tabs with `navigator.locks`, and two real Chrome tabs stayed signed in (E2E-AUTH). Browsers without Web Locks (Safari < 15.4) and retries after a dropped response are still exposed. A few seconds of grace for the immediate predecessor would close it. |
| SEC-F7 | Low | **A plain `vite build` in a developer checkout ships the test-login form,** because `frontend/.env` sets `VITE_DEV_LOGIN=true` (SEC-AUTH-12). The production API answers it with 404 `DEV_LOGIN_DISABLED`, so it is not exploitable; it only depends on the build machine having no `.env`. |
| SEC-F8 | Low | NUL characters (BUG-2) and deep nesting (BUG-3) give 500. No internals reach the client, but each logs a full stack trace. |
| SEC-F9 | Info | Catalog idea links accept `http://` (submission links require `https://`). Swagger UI is served when `NODE_ENV` is not `production` (and not in production: checked). The classmate search returns names and emails of the student's own batch, by design (2 characters minimum, at most 50 rows). |

### What held (P0 security checks that passed)

- **IDOR:** every swapped id gives 404:
  - another team, project, batch or faculty, and ids mixed across projects;
  - 46 routes across students and faculty, including writes;
  - malformed ids give 400/404, never 500.
- **Unreleased marks never reach students:** not through evaluations, dashboard, project, teams, submissions, grading, upcoming or error bodies. Released marks of another milestone are still visible: the filter is per milestone. Closed projects are read-only for former members and invisible to everyone else.
- **Roles and mass assignment:**
  - students and pending staff get 403 on 17 faculty/admin endpoints; faculty get 403 on admin endpoints; admins can't grade, release or close;
  - extra fields (`status`, `createdByFacultyId`, `publishedAt`, `leaderId`, `cycleId`, `version`, `submittedById`, `evaluatedById`, `releasedAt`, `role`) are rejected with 400;
  - `role` in the test-login body is refused.
- **Tokens:** `alg: none`, a wrong secret, a swapped payload, expired tokens, another issuer or audience, HS512, a stale `tokenVersion`, an unknown user and a non-integer version are all 401. A deactivated user's live token stops on the next request.
- **Sessions:**
  - refresh needs the web Origin (403 without it or with another origin);
  - replaying a rotated cookie revokes the family;
  - the cookie is `HttpOnly`, `SameSite=Strict` and scoped to `/api/auth`;
  - non-university and malformed accounts are refused;
  - a new staff address lands in `PENDING_STAFF` with no access.
- **Injection:** SQL strings are stored as text or refused, and tables are intact. Stored XSS in a team name, idea text and evaluation feedback renders as text in Chrome, with no dialog and no injected element. CRLF and a forged `Host` don't change redirects or cookies.
- **Abuse:** sign-in is limited to 10/min per client, and `X-Forwarded-For` does not reset it. Pagination is capped at 100 and the search at 2–100 characters. Notes at exactly 4,000 characters are accepted, 4,001 refused; URLs over 500 refused.
- **Config:**
  - CORS allows only the web origin, with credentials (`null` and other origins get nothing);
  - error bodies are `{code, message}` with no stack, SQL or paths;
  - the bundles contain no secrets, database URLs or source maps;
  - a production API refuses to boot with the test login, answers 404 to it, hides Swagger, and sends HSTS and `upgrade-insecure-requests`;
  - `npm audit`: 0 critical, 0 high, 0 moderate in production dependencies (6 low in backend dev dependencies).

## P0 user flows

**Faculty, leader and member lifecycle on a real clock** (E2E-F1, desktop Chrome 1440, 16 min, passing; [lifecycle.spec.ts](../../tests/e2e/lifecycle.spec.ts)).
One faculty member (`fac.hotel`) and three teams of batch 2025 (Alpha 3 members, Bravo 2 + 1 placed, Charlie 2).
The deadlines were minutes apart: teams at T, ideas at T+4 min, M1 from T+4 to T+8, M2 T+8–T+9, M3 T+9–T+10.

| Step | Result |
| --- | --- |
| Wizard: details, deadlines, 3 milestones (M1: GitHub required, Demo optional, Drive and Report not asked), ideas from "your list only" | Saved; the plan check says "The milestones follow each other without overlapping." |
| Review step | **Blocked**: "Before you can publish … idea list, and it is empty"; Publish disabled; "Go to Idea list" link |
| Fix: add "Campus map" to the list, switch to "Either", publish through the confirmation dialog | Published; the database has 3 milestones and M1's rule `{required: [GITHUB], optional: [DEMO]}` |
| Three leaders create teams from the dashboard's "Create or join a team by …" link, finding classmates by email | 3 teams |
| Member | Sees "… leads this team. Only the leader can change it.", no Edit/Disband; the API refuses rename and disband (403) |
| Idea | Leader proposes → faculty reject with feedback → leader sees it, revises, resubmits → faculty approve version 2 → no more edit buttons |
| **T − 1 min (team deadline)** | Leader renames the team: saved |
| **T + 1 min** | No "Edit team"; the student without a team reads "Your faculty will place you in one by …"; the faculty place her in Bravo from "Students without a team" ("Added … to Bravo Team.") and she sees her team |
| **Idea deadline − 1 min** | Bravo picks "Campus map" (approved at once); M1 shows no Submit button yet |
| **Idea deadline + 1 min** | Charlie, with no idea, reads "… has passed without an idea from your team"; M1 opens |
| M1 | A Drive link in the GitHub field is refused: "Paste the repository's link: https://github.com/owner/repo". Version 1 by a member, version 2 (with Demo) by the leader |
| **M1 due − 1 min** | Another member submits version 3 |
| **M1 due + 1 min** | No Submit button; "Not released yet"; the database holds versions 1, 2, 3 |
| Grading | Scale 20; Alpha 14 with feedback; Bravo feedback only; the team still sees "Not released yet"; release (confirmation) → "Released on …" |
| Released | The leader sees "14 / 20" and the feedback; a correction to 15 shows "15 / 20" and "Updated on …"; the dashboard says "Your result for M1 · Design review was updated" |
| Close (after M3's evaluation date) | "Close the project" (confirmation) → "The project is closed."; the leader finds it under "Past projects", read-only with its marks; a batch-mate who was never in a team gets "That project is not available." |

No console errors, uncaught exceptions or 5xx responses on any page in the whole run. An earlier
attempt stopped for 39 minutes inside a page load while the laptop slept; long runs now use `caffeinate`
and a 60-second navigation timeout.


**Student journey on seeded data** (E2E-S1), in Chrome at 1440 px, Chrome at 375 px (Pixel 7), Firefox and WebKit, all passing:

- the dashboard shows projects, what's next and "Your result for M1 … was updated", with past projects only for former members;
- the Team tab shows members and no edit after the deadline;
- the Idea tab shows the approval and the earlier rejection feedback;
- the Milestones tab shows marks (`x / 100`), feedback and "Updated on";
- for M2, a Drive link in the GitHub field is refused with "Paste the repository's link: https://github.com/owner/repo", then version 1 is saved, with exactly one new row in the database;
- a member sees the team and the new version with no leader buttons, and the API refuses their rename (403) and idea edit;
- no sideways scroll at 375 px; no console errors or 5xx on any page.

**Elective faculty** (E2E-F2, passing):

- enrolling by paste reports the staff email ("A staff email, not a student"). Students of other batches are accepted, as the panel says ("in any batch");
- enrolling by CSV counts new and already-enrolled rows;
- after publishing, an enrolled student sees the elective and a non-enrolled one does not;
- the running elective shows "20 teams", "M1 · Proposal and design: 10 of 20 teams submitted", "10 teams have not submitted …", and the database agrees.

**Visibility** (E2E-V1, passing): a 2024 student doesn't see the 2023 project and gets "That project is not available." by URL. A former member reads last term's closed project with its marks and no action buttons. A 2023 student who wasn't in it has no "Past projects" and gets "not available" by URL.

**Two tabs** (E2E-AUTH, passing): two tabs loading together stay signed in, and so does a third tab opened later.

## P1 concurrency

All 10 pass; the database was checked after each race ([races.spec.ts](../../tests/concurrency/races.spec.ts)).

| Race | Result |
| --- | --- |
| CON-1: 20 parallel submits by the 4 members of one team | 20 × 201, versions 1..20, no gaps or duplicates |
| CON-1b: 200 parallel submits over 50 teams | 200 × 201, every team's versions continuous |
| CON-2: 10 placements into a team's last slot | 1 success, 9 refused (as 400, BUG-7), team at exactly 4 |
| CON-3: two leaders add the same student | 1 × 200, 1 × 409 `STUDENT_ALREADY_IN_TEAM`; the student is in one team |
| CON-3b: a leader drops a member while another team claims them; triple-click "Create team" | edit 200 / claim 409; 1 team created, 2 × 409 |
| CON-4: two faculty tabs save one evaluation; 10 tabs make the first save | 1 × 200 + 1 × 409 `EVALUATION_CHANGED`; 1 × 200 + 9 × 409; revisions continuous, one revision for the first save |
| CON-5: publish ×4 and close ×4 (two sessions) | 1 × 200 each, the rest 409; exactly one `CYCLE_PUBLISHED` and one `CYCLE_CLOSED` audit row |
| CON-6: 20 teams submit every 100 ms from 3 s before to 3 s after the due time (1,160 requests) | 580 × 201 before, 580 × 409 `SUBMISSION_CLOSED` after, none saved at or after the due time, no 5xx |
| CON-5b: 20 evaluation saves while two release clicks race | saves 200; 1 release 200, 1 × 409 `ALREADY_RELEASED`; one audit row; students see marks |
| CON-7: faculty approve while the leader edits the same idea (10 teams) | each time exactly one wins; an approval always applies to the version the faculty read |

## Load results

**Indicative, not proof of production capacity.** k6, the API, PostgreSQL and the monitor all ran on the
M2 laptop described above, and the API was one Node process. k6 itself used 31% of a core on average
during the peak, so the generator was not the limit.

**What a virtual user does** ([flowforge.js](../../tests/load/flowforge.js)):

- A seeded student signs in once through the test login and refresh, as the web app does, and refreshes every 12 minutes.
- Then it repeats a visit:
  1. the dashboard, then 2–6 s of thinking;
  2. the project page (project, team, idea, M1 work and marks, the open milestone's work), then 3–10 s;
  3. 3 times in 10, upcoming deadlines.
- A student with open work submits on 5% of visits (2% in the peak, plus the rush).
- One virtual user in 100 is a faculty member who opens the submissions list and grading, then saves a mark.
- The spike is results day: the dashboard and the marks only, 5–20 s apart.

**Data:**

- the seed described above (3,022 users, 780 teams);
- the profiles ran back to back without reseeding, so submissions at the start of each were 874 (normal), 2,421 (peak), 4,804 (spike and soak), and 7,924 at the end.

**Targets:** p95 under 500 ms for reads and 1 s for writes, failed requests under 1%, zero 5xx, no pool
exhaustion, and no lost or duplicate submissions.

| Profile | Shape | Requests | Throughput (average / best 10 s) | All p50 / p95 / p99 | Reads p95 | Writes p95 | Failed | 5xx / no response | Submissions: k6 201s / new rows | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Normal | 500 users: 5-minute ramp, 15-minute hold | 329,124 | 258 / 317 per s | 5 ms / 10 ms / 17 ms | 10 ms | 20 ms | 0% | 0 / 0 | 1,547 / 1,547 | **Pass** |
| Peak | 3,000 users: 10-minute ramp, 20-minute hold, rush in the last 15 minutes | 1,045,601 | 557 / 674 per s | 2.09 s / 5.94 s / 6.74 s | **5.94 s** | **6.18 s** | 0.0004% | 0 / 4 | 2,383 / 2,383 | **Fail** (latency, BUG-9; 4 dropped POSTs, BUG-10) |
| Spike | 0 → 1,500 users in 60 s, 3-minute hold | 59,809 | 208 / 300 per s | 5 ms / 15 ms / 28 ms | 15 ms | 29 ms | 0% | 0 / 0 | none (results day) | **Pass** |
| Soak | 300 users for 60 minutes | 661,439 | 179 / 195 per s | 5 ms / 12 ms / 18 ms | 12 ms | 23 ms | 0% | 0 / 0 | 3,120 / 3,120 | **Pass** |

| Profile | API CPU, max (100% = one core) | API memory, max RSS | Database connections, max (all / busy) | Probe p95 (one dashboard request every 5 s) |
| --- | --- | --- | --- | --- |
| Normal | 75% | 308 MB | 11 / 7 | 10 ms |
| Peak | 195% (110–130% through the hold) | 651 MB | 11 / 6 | 4.05 s |
| Spike | 88% | 325 MB | 11 / 5 | 14 ms |
| Soak | 72% | 319 MB | 11 / 5 | 9 ms |

The 11 connections are the API's pool of 10 plus the monitor's own. **No pool exhaustion:**

- at most 7 of the 10 pooled connections were busy in any 5-second sample;
- the API logged no connection waits or timeouts.

**No lost or duplicate submissions:** in every profile, k6's count of 201 responses equals the number of new
`Submission` rows. The integrity checks after the load found continuous versions and nothing saved after a
deadline ([below](#p2-data-integrity)). Faculty saves met 5 expected `409 EVALUATION_CHANGED` conflicts in the peak.

### Where the peak bends

The ramp shows the ceiling: requests per second stop growing at about 1,250 users, and from then on
latency grows with every user added.

| Minute | Users | Requests/s | p95 (10 s window) |
| --- | --- | --- | --- |
| 1 | 343 | 212 | 10 ms |
| 2 | 648 | 390 | 11 ms |
| 3 | 943 | 568 | 17 ms |
| 4 | 1,243 | 650 | 386 ms |
| 5 | 1,543 | 655 | 1.38 s |
| 6 | 1,843 | 626 | 1.91 s |
| 8 | 2,443 | 607 | 4.31 s |
| 10 | 3,000 | 625 | 5.30 s |
| 18 (rush) | 3,000 | 562 | 6.89 s |
| 26 (rush) | 3,000 | 611 | 5.06 s |

![Peak: probe latency crosses 500 ms near minute 4 and stays at 3–5 s; API CPU flat at 110–130%; memory rises to about 600 MB; database connections constant at 11](charts/peak-timeline.svg)

![Peak: p95 by endpoint, every endpoint except sign-in above the 500 ms target; grading 7.6 s, submission lists 6.7 s, submitting 6.4 s](charts/peak-endpoints.svg)

The spike passes because results day is a light flow: 1,500 users opening their marks make about
210 requests/s, well under the ceiling. A spike of users opening the full project page would reach the
ceiling at about 1,250 users, as the peak did.

**Soak:** an hour at 300 users stayed flat:

- memory averaged 255–294 MB in every 10-minute window, with no upward trend;
- connections stayed at 11, and the probe averaged 6–7 ms throughout.

![Soak: probe latency flat under 30 ms for an hour; CPU 30–60%; memory flat near 290 MB; connections constant at 11](charts/soak-timeline.svg)

Other charts:

- normal: [timeline](charts/normal-timeline.svg), [endpoints](charts/normal-endpoints.svg);
- spike: [timeline](charts/spike-timeline.svg), [endpoints](charts/spike-endpoints.svg);
- soak: [endpoints](charts/soak-endpoints.svg).

k6's own interactive reports are in `tests/results/load/<profile>-k6-report.html`.

### Endpoints, slowest first

| Endpoint | Normal p50 / p95 / p99 | Peak p50 / p95 / p99 | Spike p50 / p95 / p99 | Soak p50 / p95 / p99 |
| --- | --- | --- | --- | --- |
| `GET …/milestones/:m/grading` (faculty) | 25 ms / 39 ms / 51 ms | 6.16 s / 7.60 s / 8.77 s | 26 ms / 45 ms / 56 ms | 30 ms / 49 ms / 59 ms |
| `GET /course-cycles/:id/milestones/:m/submissions` (faculty) | 19 ms / 31 ms / 44 ms | 5.40 s / 6.71 s / 7.72 s | 22 ms / 48 ms / 63 ms | 21 ms / 63 ms / 76 ms |
| `GET /teams/:id/milestones/:m/submissions` | 6 ms / 12 ms / 17 ms | 5.33 s / 6.66 s / 7.71 s | – | 7 ms / 13 ms / 18 ms |
| `POST /teams/:id/milestones/:m/submissions` | 10 ms / 20 ms / 30 ms | 5.06 s / 6.39 s / 7.37 s | – | 11 ms / 24 ms / 33 ms |
| `GET /teams/:id/idea` | 5 ms / 10 ms / 14 ms | 3.92 s / 4.98 s / 5.72 s | – | 6 ms / 11 ms / 17 ms |
| `GET …/teams/:id/evaluations` | 5 ms / 9 ms / 14 ms | 3.89 s / 4.89 s / 5.66 s | 5 ms / 12 ms / 22 ms | 6 ms / 10 ms / 14 ms |
| `PUT …/teams/:id/evaluation` (faculty) | 10 ms / 20 ms / 28 ms | 3.25 s / 4.08 s / 4.65 s | 13 ms / 29 ms / 40 ms | 10 ms / 17 ms / 23 ms |
| `GET /me/dashboard` | 6 ms / 12 ms / 18 ms | 3.11 s / 4.05 s / 4.82 s | 6 ms / 15 ms / 26 ms | 7 ms / 15 ms / 21 ms |
| `GET /teams/mine` | 2 ms / 5 ms / 8 ms | 1.43 s / 1.89 s / 2.22 s | – | 3 ms / 6 ms / 9 ms |
| `GET /course-cycles/:id` | 2 ms / 4 ms / 8 ms | 1.07 s / 1.44 s / 1.71 s | 2 ms / 5 ms / 9 ms | 2 ms / 6 ms / 9 ms |
| `GET /me/upcoming` | 2 ms / 5 ms / 9 ms | 1.06 s / 1.43 s / 1.71 s | – | 3 ms / 6 ms / 9 ms |
| `GET /course-cycles/my` (faculty) | 2 ms / 4 ms / 7 ms | 1.06 s / 1.42 s / 1.69 s | 2 ms / 5 ms / 10 ms | 2 ms / 5 ms / 9 ms |
| `POST /auth/refresh` | 5 ms / 12 ms / 18 ms | 700 ms / 939 ms / 1.14 s | 4 ms / 8 ms / 12 ms | 6 ms / 13 ms / 18 ms |
| `POST /auth/dev-login` | 6 ms / 15 ms / 20 ms | 85 ms / 355 ms / 399 ms | 4 ms / 8 ms / 15 ms | 7 ms / 16 ms / 19 ms |

Without queueing (normal, spike, soak), the slowest endpoints are the two faculty lists: grading and all
teams' submissions, at 31–63 ms p95. Under the peak, the endpoints that run the most queries wait longest.

### Database (pg_stat_statements, peak)

| Calls | Total time | Mean | Max | Statement |
| --- | --- | --- | --- | --- |
| 1,785,339 | 15.7 s | 0.01 ms | 7 ms | `SELECT … FROM Milestone WHERE cycleId …` |
| 879,994 | 14.7 s | 0.02 ms | 3 ms | `SELECT id, name, email FROM User WHERE id IN (…)` |
| 884,227 | 10.9 s | 0.01 ms | 5 ms | `SELECT … FROM TeamMember WHERE …` |
| 1,435,251 | 9.8 s | 0.01 ms | 3 ms | `SELECT … FROM CourseProjectCycle WHERE id …` |
| 357,287 | 9.3 s | 0.03 ms | 3 ms | `SELECT … FROM CourseProjectCycle …` (list form) |

- The top 15 statements made 9.7 million calls in the 31-minute peak (about 9 per HTTP request) and took 107 s of database time in total.
- Most statements average 0.01–0.06 ms.
- The slowest are the faculty pages' whole-project reads:
  - every version of every team's submission for a milestone (`WHERE milestoneId = $1`, no limit): 460–650 rows and 1–1.4 ms per call, growing as versions accumulate;
  - all teams' members: 1,000 rows, about 0.9 ms per call.
- These reads are why grading and the submissions list are the slowest endpoints even without load. With unlimited versions (SEC-F1), they grow without bound; they need paging or a latest-version-only read as projects grow.
- The database is not the bottleneck; the number of round trips is. `Milestone` alone is read 1.7 times per request.
- Full lists: `tests/results/load/<profile>-pg-statements.tsv`.

### Bottlenecks

1. **The API's single JavaScript thread.**
   - At the knee, the API process is CPU-bound while the database is mostly idle and the pool has spare connections.
   - Memory (up to 651 MB at the peak) and connections are not the limit.
2. **Inside that thread** (CPU profile at 900 users, 2 minutes, 447 requests/s, from [`load/profile.sh`](../../tests/load/profile.sh)):

   | Where the busy time went | Share |
   | --- | --- |
   | Prisma client: building queries and mapping results | 30.4% |
   | `jsonwebtoken.verify` re-parsing the secret on every request (`crypto.createPublicKey`) | 17.0% |
   | V8 built-ins, garbage collection | 18.6% |
   | HTTP stack (Node `http`, Express, streams) | 15.5% |
   | `pg` driver, Prisma adapter | 11.3% |
   | Application code, all modules | 3.0% |
   | Nest, passport, validation | 1.6% |

### First three fixes

1. **Run several API processes behind the proxy**, one per core (Node cluster, PM2 or several containers).
   - The database used about 6% of one connection's time at the peak, so throughput should scale nearly linearly at first.
   - Keep processes × pool size under PostgreSQL's `max_connections`, with headroom.
   - Set `keepAliveTimeout` above the proxy's idle timeout first (BUG-10).
   - At about 0.5 requests/s per active user, 3,000 users need about 1,500 requests/s: three processes or more at this machine's 650 each.
2. **Create the JWT key once.** In [jwt-token.signer.ts](../../backend/src/auth/infrastructure/jwt-token.signer.ts), build `crypto.createSecretKey(Buffer.from(accessSecret))` once and use it for sign and verify.
   - This removes about 17% of the API's CPU per request: 241 µs → 4 µs per verify, measured with jsonwebtoken 9.0.3 on this machine.
   - It is a small, local change.
3. **Fewer queries per request.**
   - Read a project and its milestones once per request (`Milestone` is read 1.7 times per request), and batch the user-name lookups.
   - Short-lived caching of a project's milestones is safe: they change only when the faculty edit the plan.
   - Each query avoided saves Prisma and driver work, which is 42% of the CPU.

Then rerun `./load/run.sh peak`. The target is p95 under 500 ms at 3,000 users.

**A first load run was discarded.**

- The k6 script lost each user's refresh cookie between iterations, because k6 empties the cookie jar by default. So refreshes after 12 minutes failed with `401 INVALID_REFRESH_TOKEN`.
- Once the 15-minute access tokens expired, requests failed with 401: 21% in normal, 65% in peak, 78% in soak.
- The script now keeps cookies (`noCookiesReset`). A `refresh_failures` threshold and a per-status log of unexpected responses would catch this kind of failure next time.
- All four profiles were rerun from a fresh seed; the results above come from the rerun.
- The first run's files are kept in `tests/results/raw/run1-cookie-bug/`. Its first 15 minutes agree with the rerun: the same knee at about 1,250 users and the same CPU-bound API.

## P2

**Accessibility:**

- axe (WCAG 2.0/2.1 A and AA) on 22 pages:
  - login, the student dashboard and the overview tabs, the six wizard steps and the faculty overview are clean;
  - project tabs fail contrast (BUG-4), and the admin page fails labels (BUG-5);
  - full list in [`tests/results/a11y.json`](../../tests/results/a11y.json).
- Keyboard-only:
  - a student submits work in 10 Tab presses (KEY-1, passing);
  - a faculty member grades and saves by keyboard (KEY-2, passing; see BUG-6 for the 513 presses).
- Focus is visible on the buttons used.

**Browsers:** the student journey passes in Chromium, Firefox and WebKit, desktop and 375 px.

**Resilience** ([resilience.spec.ts](../../tests/e2e/resilience.spec.ts)):

- RES-1, database restart mid-session: **failed** (BUG-8).
  - During the outage, reads and writes get `500 INTERNAL_ERROR` with no internals, and no write is half-applied.
  - The API recovers by itself within a second of the database.
  - But the student ends up signed out.
- RES-2, slow 3G (400 ms latency, 50 KB/s, cache off) at 375 px: **passed**.
  - A loading state shows and the page is never blank.
  - The dashboard arrives in 4.3 s and the project page in 5.3 s (124 KB transferred).


## P2 data integrity

[`support/integrity.cjs`](../../tests/support/integrity.cjs) runs 21 SQL checks against the QA database:

- orphans and empty teams;
- leaders who aren't members;
- team sizes and batch rules;
- one idea per team, and review history;
- submission versions without gaps or duplicates, none before opening or after the due time, all by team members of teams with an approved idea;
- evaluations within their scale, with matching revisions and the right faculty;
- milestone order;
- no live refresh tokens for deactivated users.

| Run | Data at the time | Result |
| --- | --- | --- |
| After the functional suites (security, concurrency) | 3,023 users, 807 teams, 1,779 submissions, 521 evaluations | **21 / 21 pass** |
| After the four load profiles (about 2 hours, 2.1 million requests) | 3,022 users, 780 teams, 7,924 submissions, 546 evaluations, 14,183 audit rows | **21 / 21 pass** |

Results: `tests/results/integrity-functional.json`, `tests/results/integrity-after-load.json`.

## How to rerun

From `tests/` (full details in [tests/README.md](../../tests/README.md)):

```sh
npm install && npx playwright install chromium firefox webkit     # once; and: brew install k6
QA_LOAD=1 ./support/qa-stack.sh up                                # DB :5433, API :3200, web :5300
./run-all.sh                                                      # every functional suite, reseeding before each
LOAD=1 ./run-all.sh                                               # plus normal, peak, spike, soak (~2 h)
```

| Suite | Command (reseed first: `node seed/seed.cjs`) |
| --- | --- |
| Security | `npx playwright test --project=security` |
| Concurrency | `npx playwright test --project=concurrency --workers=1` |
| Lifecycle (real clock, ~17 min) | `npx playwright test --project=desktop-chrome e2e/lifecycle.spec.ts --workers=1` |
| Elective faculty | `npx playwright test --project=desktop-chrome e2e/elective.spec.ts` |
| Journey in 4 browsers + visibility | `npx playwright test --project=chrome-journey --project=mobile-chrome --project=firefox --project=webkit` |
| Accessibility and keyboard | `npx playwright test --project=a11y --workers=1` |
| Resilience (stops the QA DB briefly) | `npx playwright test --project=resilience --workers=1` |
| Integrity | `node support/integrity.cjs` |
| Load | `./load/run.sh normal` (or `peak`, `spike`, `soak`, `smoke`); charts: `node support/charts.cjs normal peak spike soak`; tables: `node load/tables.cjs normal peak spike soak` |
| CPU profile of the API under load (second API on :3202, ~3 min) | `./load/profile.sh` |
