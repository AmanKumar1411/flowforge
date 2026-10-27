# Phase 3 test report: authentication and RBAC

**Date:** 2026-10-27 · **Branch:** `phase3-auth-rbac` · **Environment:** macOS, Node 22.14,
PostgreSQL in Docker (`flowforge_test`), headless Google Chrome

## Result

**All 365 tests and checks pass. All quality gates pass.**

| Layer | Runner | What it exercises | Passed | Time |
| --- | --- | --- | ---: | ---: |
| Unit | Jest | Domain rules, sessions, config, Google token handling | **157 / 157** | 1.5 s |
| Integration | `node:test` + real PostgreSQL | Full HTTP API through the real Nest app, Google faked at its network boundary | **188 / 188** | 12.8 s |
| Browser end-to-end | Chrome via `playwright-core` | Real React app against the real API | **20 / 20** | 3.9 s |
| **Total** | | | **365 / 365** | |

| Gate | Result |
| --- | --- |
| Backend `build`, `typecheck` (incl. tests), `lint` | Pass |
| `prisma validate`, `prisma migrate status` (3 migrations) | Valid, up to date |
| Frontend `build`, `lint` | Pass |

## Plan traceability (Part D and security baseline)

| Requirement from the plan | Covered by | Result |
| --- | --- | --- |
| Parser: years 23–26, any surname initial, no surname (`rahul.25`, `rahul.25csai`), case and whitespace, missing digits, `rahul.2025` and `rahul.5` rejected, wrong domain, configured pattern | `rishihood-identity-parser.spec.ts` (48) | Pass |
| Student and staff patterns never overlap (17 samples against both) | `rishihood-identity-parser.spec.ts` | Pass |
| RoleResolver: student, bootstrap admin, existing admin, allowlisted staff, unlisted staff (`prakriti.p`, `sahil.a`, `sahil.a2`), neither shape, deactivated, student email never elevated | `role-resolver.spec.ts` (26) | Pass |
| Batch range with a fake `Clock` | `batch-year.policy.spec.ts` (10) | Pass |
| Session rotation, old token revoked, reuse revokes the family, 30-day family expiry | `session.service.spec.ts` (10) | Pass |
| First login creates STUDENT with the right batch; a later login keeps an admin-corrected batch | Integration: Google Sign-In | Pass |
| ID-token failures each denied and audited: wrong `hd`, no `hd`, `email_verified=false`, wrong audience, bad nonce, bad state, tampered or missing state cookie, cancelled | Integration: Google Sign-In (9) + unit `google-oauth.client.spec.ts` (real RS256 verification: audience, issuer, expiry, signature) | Pass |
| Allowlisted faculty logs in as FACULTY; after removal, the existing access token is rejected on the next request | Integration: Faculty access | Pass |
| Unlisted staff → PENDING_STAFF with one request (no duplicate); every API except `/auth/me` and logout → `FACULTY_APPROVAL_PENDING`; approval → FACULTY on the next refreshed request | Integration: Faculty access; Browser checks 10–13 | Pass |
| Admin cannot add or approve a student-pattern email (audited) | Integration: Faculty access (5); Browser check 16 | Pass |
| Deactivated user: access token rejected immediately, refresh rejected, login refused | Integration: User administration; Browser check 18 | Pass |
| Refresh reuse: replaying an old token revokes the family; the newer token stops working | Integration: Sessions | Pass |
| `logout-all` invalidates every session | Integration: Sessions; Browser check 20 | Pass |
| RBAC matrix: every role (and anonymous) × every admin route and Phase 2 cycle route; forbidden → 403, other owner's resource → 404 | Integration: RBAC matrix (126) | Pass |
| Dev login refused when disabled; app refuses to boot with dev login in production | Integration: Dev login switched off; Boot-time configuration (child process) | Pass |
| Boot fails clearly on a missing variable, a student pattern without a capture group, or a student bootstrap admin | `env.validation.spec.ts` (33); Integration: Boot-time configuration | Pass |
| Rate limits on `/api/auth` (per route, per IP); `/auth/me` not throttled | Integration: Rate limiting | Pass |
| `Origin` must equal `FRONTEND_URL` on refresh, logout, dev-login | Integration: Sessions (6) | Pass |
| Refresh cookie `httpOnly`, `SameSite=Strict`, `Path=/api/auth`, stored only as a SHA-256 hash | Integration: Sessions; Browser check 6 | Pass |
| Forged access tokens (`alg: none`, foreign secret, foreign audience) rejected | Integration: Sessions | Pass |
| Audit log is append-only (UPDATE and DELETE refused by the database) | Integration: Sessions | Pass |
| Frontend: access token never stored, single-flight refresh, two tabs never trigger reuse, role redirects, pending page, admin console | Browser checks 5–9, 10–13 | Pass |
| **All existing Phase 2 tests still pass** (with the agreed change: hidden cycles return 404 instead of 403) | `course-cycle.service.spec.ts` (7), `cycle-workflow.spec.ts` (8), Integration: Course cycles (3) | Pass |

## Unit tests (Jest)

| Suite | Passed | Time |
| --- | ---: | ---: |
| `src/auth/infrastructure/rishihood-identity-parser.spec.ts` | 48/48 | 0.02 s |
| `src/config/env.validation.spec.ts` | 33/33 | 0.02 s |
| `src/auth/domain/role-resolver.spec.ts` | 26/26 | 0.01 s |
| `src/auth/application/session.service.spec.ts` | 10/10 | 0.03 s |
| `src/auth/domain/batch-year.policy.spec.ts` | 10/10 | 0.01 s |
| `src/course-cycles/domain/cycle-workflow.spec.ts` | 8/8 | 0.01 s |
| `src/course-cycles/course-cycle.service.spec.ts` | 7/7 | 0.92 s |
| `src/auth/infrastructure/google-identity.provider.spec.ts` | 7/7 | 0.01 s |
| `src/auth/infrastructure/google-oauth.client.spec.ts` | 5/5 | 0.34 s |
| `src/auth/infrastructure/dev-identity.provider.spec.ts` | 3/3 | 0.01 s |

## Integration tests (`npm run test:integration`)

| Suite | Passed | Time |
| --- | ---: | ---: |
| RBAC matrix | 126/126 | 0.56 s |
| Google Sign-In | 13/13 | 0.39 s |
| Sessions | 12/12 | 0.48 s |
| Faculty access | 10/10 | 0.80 s |
| Login eligibility (through dev login, same code path) | 8/8 | 0.17 s |
| User administration | 5/5 | 0.49 s |
| Boot-time configuration | 5/5 | 3.37 s |
| Rate limiting on /api/auth | 4/4 | 0.23 s |
| Course cycles (Phase 2 scenario) | 3/3 | 0.32 s |
| Dev login switched off | 2/2 | 0.17 s |

## Browser end-to-end checks (`e2e/browser`)

| # | Check | Result |
| ---: | --- | --- |
| 1 | Login page offers Google sign-in and the dev form | Pass |
| 2 | Google button starts the server-side OAuth flow with state, nonce and PKCE; state cookie httpOnly, `SameSite=Lax` | Pass |
| 3 | A forged Google callback is refused and explained on the login page | Pass |
| 4 | Wrong-domain and ineligible emails are refused with clear messages | Pass |
| 5 | Student signs in with exactly one refresh call (despite React StrictMode) and lands on their batch | Pass |
| 6 | The access token is never stored by the browser; the refresh cookie is httpOnly and Strict | Pass |
| 7 | Reloading restores the session from the refresh cookie | Pass |
| 8 | Two tabs refreshing at the same moment stay signed in (no false reuse alarm) | Pass |
| 9 | A student is sent back to their own dashboard from `/admin` | Pass |
| 10 | Unlisted staff sees "Waiting for admin approval" and cannot open faculty screens | Pass |
| 11 | Bootstrap admin lands on the admin console with pending requests first | Pass |
| 12 | Admin approves the request | Pass |
| 13 | Approved staff becomes FACULTY on "Check again" without signing in again | Pass |
| 14 | Faculty creates and publishes a cycle for batch 2023 | Pass |
| 15 | Student of batch 2023 sees the published cycle | Pass |
| 16 | Admin cannot allowlist a student email | Pass |
| 17 | Batch correction applies to the student's next session (the 2023 cycle disappears) | Pass |
| 18 | Deactivation ends the user's session at their next request, with the reason shown | Pass |
| 19 | Sign out ends the session; a reload stays signed out | Pass |
| 20 | "Sign out everywhere" also ends the session on another device | Pass |

## Defects found by this round and fixed

| # | Found by | Defect | Fix |
| --- | --- | --- | --- |
| 1 | Browser check 20 | When a session ended **without** clicking "Sign out" (logout-all on another device, deactivation, reuse detection), the page went blank on its current URL instead of going to `/login`. `AppShell` returned `null` when signed out, which hid the route guard that performs the redirect. | `AppShell` renders its `<Outlet />` when there is no session, so the guard redirects. |
| 2 | Browser check 18 | A deactivated user was told "Your session ended" instead of "account deactivated": the client tried a refresh first and reported the refresh error. | `api/client.ts` ends the session with `ACCOUNT_DEACTIVATED` directly; `AuthProvider` keeps the reason for revoked, reused or deactivated sessions so `/login` explains it. |
| 3 | Rate-limit test | Not a defect: `@nestjs/throttler` counts each login route separately per IP, while the first test assumed one shared budget. That still meets the plan (10/min/IP for login routes) and lets a full Google sign-in (start plus callback) count once per route. | Test asserts the real behaviour; README and architecture doc say "per route, per IP". |

The browser script itself needed three corrections during the round (following a server redirect,
clicking "Check again" in place, and triggering an API call after deactivation). These were test
bugs, not product defects.

## Not covered and known limitations

- **Real Google accounts.** The OAuth client is not configured yet, so Google's two network calls
  (code exchange and certificate fetch) are faked. Everything above them runs for real, and ID-token
  verification is unit-tested against real RS256 signatures made with local keys. After the Google
  Cloud setup, sign in once by hand as a student and as a staff member.
- **Production settings** (`Secure` cookies, HSTS, no Swagger) are switched by `NODE_ENV` and
  covered by unit tests of the configuration, not by a deployed HTTPS run.
- **Paused database.** The API has no database connection timeout, so a paused Docker makes the
  app and integration tests wait instead of failing fast.
- The frontend has no component unit tests; its auth behaviour is covered by the browser checks.

## How to reproduce

```bash
cd backend && npm test                      # unit
cd backend && npm run test:integration      # needs Docker running and the flowforge_test database
# browser checks: see e2e/browser/README.md
```
