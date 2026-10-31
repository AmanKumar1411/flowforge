# FlowForge QA plan: end-to-end, load, concurrency and security

Branch `qa-full-testing` from `main` at `6166b60`. **No application code changes**; everything
lives in `tests/`. Bugs are reported, not fixed.

## Environment (every result is labelled with it)

| Item | Value |
| --- | --- |
| Machine | Apple M2 (8 cores), 8 GB RAM, macOS, Docker Desktop. Load numbers are **indicative only** |
| Database | Separate container `flowforge-qa-db` (PostgreSQL 18, port 5433, `pg_stat_statements`, `max_connections=200`), database `flowforge_qa`. Never the dev DB, never `flowforge_test` |
| API | Compiled build (`node dist/main`) on `:3200`, `NODE_ENV=development`, dev login on (test-only), login/refresh rate limits raised for load runs only |
| Frontend | Production build (`vite build` + `vite preview`) on `:5300`, dev-login form on |
| Test login | Existing dev login (`POST /auth/dev-login`), refused at boot when `NODE_ENV=production` (proved in SEC-AUTH-6) |

## Seed (`tests/seed/seed.cjs`)

3 batches (2023–2025) × 1,000 students, 20 faculty, 1 admin. Core main projects per batch (220
teams each; M1 graded and released / graded not released / ungraded; M2 open, due in 3 hours;
M3 upcoming), an elective in team formation (enrolled students), a project in the idea stage, a
closed project with released results, drafts. ≈750 teams; ideas approved, rejected-then-approved
and picked; submissions with several versions; evaluations with revisions.

## Test cases by priority

### P0: user flows (Playwright, real browser, 1440px and 375px, UI only)

| ID | Flow |
| --- | --- |
| E2E-F1 | Faculty: wizard core project (3 milestones, link rules, idea list) → blocked publish → fix → publish → teams forming → place a student → approve one idea, reject one with feedback → milestone due → grade → release → correct → close |
| E2E-F2 | Elective faculty: create → enroll (paste + CSV) → publish → teams list and submission counts |
| E2E-S1 | Leader: dashboard → project → create team with members → submit idea → rejection feedback → revise → approved → submit M1 (wrong link type refused, clear message) → version 2 → released marks and "Updated" |
| E2E-S2 | Member: sees team and status, submits a milestone, no leader-only buttons; API refuses leader actions |
| E2E-T1 | Edge timing: 1 minute before and after the team lock, idea deadline, milestone opening and due date |
| E2E-V1 | Visibility: another batch's student, a past project read-only for former members, hidden from a student with no team |
| Every step | Right page and data, clear messages, no console errors, no 5xx, loading and empty states |

### P0: security (as a malicious student)

| ID | Check |
| --- | --- |
| SEC-IDOR | Swap every id (cycle, team, milestone, idea, evaluation, submission) across students, teams, batches and faculty; hidden → 404; unreleased marks never leak (API, dashboard, lists, errors, bundle) |
| SEC-ROLE | Student calls faculty/admin endpoints; mass assignment of `role`, `batchYear`, `leaderId`, `status`, `version` |
| SEC-AUTH | No token, expired, `alg: none`, changed role, wrong signature; logout invalidates; non-university account; test login off in production |
| SEC-INJ | SQL injection in inputs, query params and filters; stored XSS in names, ideas, feedback, links (`javascript:`); header injection; oversized and malformed JSON |
| SEC-LINK | Fake GitHub/Drive, `http://`, IP and localhost URLs |
| SEC-ABUSE | Rate limiting, huge payloads, deep pagination, user enumeration |
| SEC-CONF | CORS, security headers, error bodies, secrets in bundle/source maps, `npm audit` high/critical |

### P1: concurrency (database checked afterwards)

| ID | Race |
| --- | --- |
| CON-1 | 20 members submit the same milestone → versions 1..n, no gaps or duplicates |
| CON-2 | 20 adds to a team with one free slot → never above `maxTeamSize` |
| CON-3 | Two edits of one team at once; two leaders adding the same student |
| CON-4 | Two faculty-tab saves of one evaluation → one 200, one 409 |
| CON-5 | Publish and close twice; release while grading continues |
| CON-6 | Submissions racing the due date |

### P1: load (k6)

| ID | Profile | Targets |
| --- | --- | --- |
| LOAD-1 | Normal day: ramp to 500 VUs over 5 min, hold 15 min | p95 < 500 ms reads, < 1 s writes; errors < 1%; no 5xx; no pool exhaustion; no lost or duplicate submissions |
| LOAD-2 | Deadline peak: 3,000 VUs over 10 min, 40% submit in the last 15 min, hold 20 min | Same |
| LOAD-3 | Spike: 0 → 1,500 in 60 s (results released) | Same |
| LOAD-4 | Soak: 300 VUs for 60 min | Same, plus stable memory and connections |

### P2

| ID | Check |
| --- | --- |
| A11Y | axe on every main page; keyboard-only student submit and faculty grading |
| BROWSER | Chrome, Firefox, WebKit (leader flow) |
| RES | DB restart mid-test; slow 3G loading states |
| DATA | Integrity after all tests: orphans, team sizes, one idea per team, continuous versions |
