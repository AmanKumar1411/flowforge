# FlowForge

FlowForge is a course-project lifecycle platform: faculty run project cycles, students form teams,
submit versioned work and receive private evaluations. It is a 7th-semester System Design and
Software Development capstone.

Implemented so far:

- **Phase 1:** foundation (NestJS API, PostgreSQL via Prisma, React client)
- **Phase 2:** faculty-owned course/project cycles with a state machine and batch visibility
- **Phase 3:** Google Sign-In restricted to `nst.rishihood.edu.in`, server-side roles (STUDENT,
  FACULTY, ADMIN, PENDING_STAFF), refresh-token sessions with reuse detection, an admin console and
  an append-only audit log
- **Phase 4:** teams. Faculty set team sizes and a formation deadline per cycle. A student creates
  a team, becomes its leader and adds batch-mates found by name or email; they are members at
  once. Leaders can change members until the deadline, after which teams are fixed. The
  database guarantees one team per student per cycle.
- **Phase 5:** team completion and electives. After the students' deadline the owning faculty
  place everyone still without a team, by hand or by random auto-group with a preview. Students
  can mark themselves "looking for a team". Electives have an enrollment list the faculty import.
- **Phase 6:** project ideas. Each team's leader submits one idea by the idea deadline; the
  owning faculty approve it or reject it with feedback, and a rejected idea can be resubmitted
  (until submissions open at first; Phase 7 removed that cut-off). Faculty can also register a
  core batch's students before they sign in, so nobody is left out of teams.
- **Phase 7:** the faculty's idea list and submissions. Faculty can publish ideas that teams
  pick (approved at once, any number of teams per idea), next to proposals; after a rejection,
  feedback rounds continue until the cycle closes. Teams with an approved or picked idea submit
  their work as links and notes: any member, a new version each time, until the submission
  deadline.

Evaluations come later.

## Prerequisites

- Node.js 22.12 or newer
- Docker Compose
- A Google Cloud project to create an OAuth client (see below). Without it, use dev login.

## Local setup

1. **Database**
   - Copy `infra/.env.example` to `infra/.env` and choose a password.
   - Start PostgreSQL: `docker compose -f infra/docker-compose.yml up -d`.
   - For integration tests, create the test database once:
     `docker exec flowforge-postgres createdb -U flowforge flowforge_test`.
2. **Backend** (`backend/`)
   - Copy `.env.example` to `.env`.
   - Set `DATABASE_URL` with the same password as `infra/.env`.
   - Generate two different secrets with `openssl rand -base64 48`, one for `JWT_ACCESS_SECRET` and
     one for `COOKIE_SECRET`.
   - Put your staff email in `ADMIN_BOOTSTRAP_EMAILS` so the first login is an admin.
   - Fill in the Google variables (next section), or use dev login.
   - Run `npm ci`, `npm run prisma:generate` and `npm run prisma:migrate:deploy`.
   - Optionally run `npm run seed:demo` to create the [demo accounts](#demo-accounts).
   - Start the API with `npm run start:dev`. It listens on `http://localhost:3000/api`; Swagger is
     at `http://localhost:3000/api/docs`.
3. **Frontend** (`frontend/`)
   - Copy `.env.example` to `.env`. `VITE_DEV_LOGIN=true` shows the dev login form.
   - Run `npm ci`, then `npm run dev`.
   - Open **`http://localhost:5173`**. Use `localhost`, not `127.0.0.1`: the API checks the
     `Origin` header against `FRONTEND_URL`.

The app refuses to start if any required variable is missing or invalid, and the message names the
variable.

### Creating the Google OAuth client

1. In [Google Cloud Console](https://console.cloud.google.com/), create or select a project, ideally
   inside the university's Google Workspace organization.
2. **APIs & Services → OAuth consent screen**: choose **Internal** (only `nst.rishihood.edu.in`
   accounts can sign in) and add the scopes `openid`, `email` and `profile`.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type **Web application**.
   - Authorized redirect URI: `http://localhost:3000/api/auth/google/callback` (add the production
     URL later). Note the `/api` prefix.
   - No JavaScript origins are needed: the flow is server-side.
4. Copy the client ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in
   `backend/.env`, and set `GOOGLE_REDIRECT_URI` to the exact redirect URI.

If the consent screen cannot be Internal (the project is outside the university organization), use
External in Testing mode and add test users. The API still rejects anyone whose ID token `hd` claim
is not `nst.rishihood.edu.in`.

| Symptom | Cause and fix |
| --- | --- |
| Google shows `Error 400: redirect_uri_mismatch` | `GOOGLE_REDIRECT_URI` must match an authorized redirect URI **exactly**: scheme, host, port, `/api` and no trailing slash |
| Google shows `Error 403: org_internal` | The consent screen is Internal and you signed in with an account outside the university |
| Google shows "Access blocked: app is in testing" | External consent screen in Testing mode: add your account under Test users |
| Back on `/login?error=WRONG_HOSTED_DOMAIN` | You chose a personal Google account; pick your `@nst.rishihood.edu.in` account |
| Back on `/login?error=INVALID_ID_TOKEN` | Wrong client ID or secret in `backend/.env`, or the server clock is far off |
| Back on `/login?error=INVALID_OAUTH_STATE` | The sign-in started on another host name (`127.0.0.1` versus `localhost`) or took more than 10 minutes |
| `EADDRINUSE` on port 3000 | Something else uses the port: stop it, or set `PORT`, `GOOGLE_REDIRECT_URI` and the frontend's `VITE_API_BASE_URL` to another port, and add that redirect URI in Google Cloud |

### Who gets which role

| Email | Role on login |
| --- | --- |
| Student shape, e.g. `aman.k23csai@`, `rahul.25@`: two-digit admission year | `STUDENT`, batch `2000 + YY` (set once; admins can correct it) |
| Staff shape, e.g. `prakriti.p@`, `sahil.a2@`, listed in `ADMIN_BOOTSTRAP_EMAILS` | `ADMIN` |
| Staff shape on the faculty allowlist | `FACULTY` |
| Any other staff shape | `PENDING_STAFF` until an admin approves the access request |
| Anything else | Denied (`EMAIL_NOT_ELIGIBLE`) |

A student email can never become FACULTY or ADMIN. See [ADR 002](docs/decisions/002-roles-resolved-server-side.md).

### Demo accounts

For trying the app locally, `npm run seed:demo` (in `backend/`) creates these accounts in the
database from `DATABASE_URL`. With `VITE_DEV_LOGIN=true`, the login page lists them and one click
signs in; no Google account is needed. All emails end in `@nst.rishihood.edu.in`.

| Account | Email | Role |
| --- | --- | --- |
| Demo Admin | `admin.demo@` | `ADMIN` |
| Coordinator X, Coordinator Y | `coordinator.x@`, `coordinator.y@` | `ADMIN` (coordinators are admins; there is no separate role) |
| Anita Sharma, Rohit Verma | `anita.sharma@`, `rohit.verma@` | `FACULTY`, added to the faculty allowlist |
| Aarav Shah, Diya Kapoor | `aarav.s23csai@`, `diya.k23csai@` | `STUDENT`, batch 2023 |
| Ishaan Mehta, Kavya Reddy | `ishaan.m24csai@`, `kavya.r24csai@` | `STUDENT`, batch 2024 |
| Arjun Patel, Sana Qureshi | `arjun.p25csai@`, `sana.q25csai@` | `STUDENT`, batch 2025 |
| Vivaan Gupta, Zoya Ahmed | `vivaan.g26csai@`, `zoya.a26csai@` | `STUDENT`, batch 2026 |

Students exist before they first sign in, so they already appear in team search. Running the
command again changes nothing, except that a demo admin or faculty member who lost that role gets
it back. It skips deactivated accounts and says so. Like dev login, it refuses to run in production
or with `AUTH_DEV_LOGIN_ENABLED=false`. The list is in
[demo-accounts.ts](backend/src/auth/application/demo-accounts.ts).

## Environment variables

`backend/.env` (all documented in `backend/.env.example`):

| Key | Purpose |
| --- | --- |
| `NODE_ENV` | `development`, `test` or `production` (secure cookies, HSTS, no Swagger, no dev login) |
| `PORT`, `DATABASE_URL` | API port and PostgreSQL URL |
| `FRONTEND_URL` | The only allowed CORS and `Origin`; login redirects go here |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | OAuth client (above) |
| `ALLOWED_HOSTED_DOMAIN` | Required `hd` claim of the Google ID token |
| `STUDENT_EMAIL_PATTERN` | Anchored full-email regex; capture group 1 is the two-digit admission year |
| `STAFF_EMAIL_PATTERN` | Anchored full-email regex for staff (at most one digit) |
| `BATCH_BASE_YEAR`, `BATCH_MIN_YEAR` | Batch = base + YY; accepted from the minimum to next year |
| `ADMIN_BOOTSTRAP_EMAILS` | Comma-separated staff emails that become ADMIN |
| `JWT_ACCESS_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`, `ACCESS_TOKEN_TTL` | Access token (HS256, `15m`) |
| `REFRESH_TOKEN_TTL_DAYS`, `REFRESH_FAMILY_MAX_DAYS` | Refresh-token and absolute session lifetime, both `1`: a sign-in lasts one day |
| `COOKIE_SECRET` | Signs the OAuth state cookie; must differ from the JWT secret |
| `AUTH_DEV_LOGIN_ENABLED` | Enables `POST /api/auth/dev-login`; refused at boot in production |
| `AUTH_LOGIN_RATE_LIMIT_PER_MINUTE`, `AUTH_REFRESH_RATE_LIMIT_PER_MINUTE` | Optional limits per route, per IP, per minute (10 for each login route, 30 for refresh and logout) |

`infra/.env`: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`.
`frontend/.env`: `VITE_API_BASE_URL`, `VITE_DEV_LOGIN`.

## Scripts and tests

In `backend/`:

| Command | What it does |
| --- | --- |
| `npm run build` / `npm run lint` / `npm run typecheck` | Compile, lint, type-check including `test/` |
| `npm run seed:demo` | Create the [demo accounts](#demo-accounts); safe to run again |
| `npm test` | Jest unit tests (domain rules, sessions, config, Google token verification) |
| `npm run test:integration` | `node:test` against real PostgreSQL `flowforge_test`: Google flow (Google faked at its network boundary), faculty access, sessions, admin, RBAC matrix, boot checks, Phase 2 scenario, teams, ideas and submissions (including races and database constraints) |

Integration tests use `TEST_DATABASE_URL` if set; otherwise they take `DATABASE_URL` from
`backend/.env` and switch the database to `flowforge_test`. They refuse to run against any other
database and truncate its tables between tests. Jest cannot load NestJS 12's ES modules on
Node 22, which is why integration tests use Node's built-in runner.

In `frontend/`: `npm run build` and `npm run lint`.

Browser end-to-end checks of the sign-in flows, the team screens, team completion, ideas and
submissions live in [e2e/browser](e2e/browser/README.md). The latest results are in the
[Phase 7 test report](docs/testing/phase7-test-report.md).

## API

All routes use the `/api` prefix and every error is `{ code, message }`. Interactive docs:
`/api/docs` (not served in production).

| Method | Path | Access |
| --- | --- | --- |
| GET | `/auth/google` | public, redirects to Google |
| GET | `/auth/google/callback` | public, Google redirects here |
| POST | `/auth/dev-login` | public, development only, Origin checked |
| GET | `/auth/dev-login/accounts` | public, development only: the demo accounts |
| POST | `/auth/refresh` | refresh cookie and Origin; returns `{ accessToken }` |
| POST | `/auth/logout` | refresh cookie and Origin |
| POST | `/auth/logout-all` | any signed-in user |
| GET | `/auth/me` | any signed-in user, including PENDING_STAFF |
| GET, POST | `/admin/faculty-allowlist` | ADMIN |
| DELETE | `/admin/faculty-allowlist/:id` | ADMIN |
| GET | `/admin/faculty-requests?status=` | ADMIN |
| POST | `/admin/faculty-requests/:id/approve`, `/reject` | ADMIN |
| GET | `/admin/users?role=&batchYear=&status=&cursor=&limit=` | ADMIN |
| PATCH | `/admin/users/:id/batch` | ADMIN |
| POST | `/admin/users/:id/deactivate`, `/reactivate` | ADMIN (not yourself) |
| POST | `/course-cycles` | FACULTY |
| GET | `/course-cycles` | STUDENT (own batch), ADMIN (all published or closed) |
| GET | `/course-cycles/my` | FACULTY |
| GET | `/course-cycles/:id` | STUDENT, FACULTY, ADMIN (404 when not visible) |
| PATCH | `/course-cycles/:id` | FACULTY owner |
| POST | `/course-cycles/:id/publish`, `/close` | FACULTY owner |
| POST | `/course-cycles/:id/teams` | STUDENT of the batch, while formation is open; caller becomes leader |
| GET | `/course-cycles/:id/teams` | STUDENT (own team), FACULTY owner, ADMIN (all teams) |
| GET | `/course-cycles/:id/team-candidates?q=` | STUDENT, while formation is open |
| GET | `/teams/mine` | STUDENT |
| GET | `/teams/:id` | Members, FACULTY owner, ADMIN (404 otherwise) |
| PATCH, DELETE | `/teams/:id` | Team leader, while formation is open |
| GET, PUT, DELETE | `/course-cycles/:id/looking-for-team` | STUDENT of the cycle, while formation is open: GET lists who is looking; PUT and DELETE set your own flag |
| GET, POST | `/course-cycles/:id/enrollments` | FACULTY owner of an elective (POST takes `{ emails }`) |
| DELETE | `/course-cycles/:id/enrollments/:email` | FACULTY owner of an elective, unless the student is in a team |
| GET | `/course-cycles/:id/team-completion` | FACULTY owner, ADMIN (read-only): students without a team |
| POST | `/course-cycles/:id/team-completion/teams` | FACULTY owner, between the two team deadlines |
| POST | `/course-cycles/:id/team-completion/auto-group/preview`, `/auto-group` | FACULTY owner, between the two team deadlines |
| POST | `/teams/:id/members` | FACULTY owner, between the two team deadlines |
| GET, POST | `/course-cycles/:id/batch-students` | FACULTY owner of a core cycle: the batch list; POST `{ emails }` registers students who have not signed in |
| GET | `/teams/:id/idea` | Team members, FACULTY owner, ADMIN |
| PUT | `/teams/:id/idea` | Team leader: propose or edit before the idea deadline; after a rejection, resubmit any time while the cycle is published |
| POST | `/teams/:id/idea/pick` | Team leader: `{ catalogIdeaId }`, approved at once; whenever a proposal could be saved |
| POST | `/teams/:id/idea/review` | FACULTY owner: `{ version, decision, feedback }` (feedback required to reject) |
| GET | `/course-cycles/:id/ideas` | FACULTY owner, ADMIN: every team with its idea |
| GET | `/course-cycles/:id/idea-catalog` | STUDENT of the cycle, FACULTY owner, ADMIN: the faculty's ideas with how many teams picked each |
| POST | `/course-cycles/:id/idea-catalog` | FACULTY owner, until the cycle closes: `{ title, description, link? }` |
| PUT, DELETE | `/course-cycles/:id/idea-catalog/:ideaId` | FACULTY owner; a picked idea cannot be removed |
| GET | `/teams/:id/submissions` | Team members, FACULTY owner, ADMIN: every version, newest first |
| POST | `/teams/:id/submissions` | Any team member, with an approved or picked idea, between "submissions open" and the deadline: `{ repositoryUrl, demoUrl?, reportUrl?, notes? }` |
| GET | `/course-cycles/:id/submissions` | FACULTY owner, ADMIN: every team with its idea and latest version |

Cycles accept `minTeamSize`, `maxTeamSize` (defaults 1 and 4, at most 10),
`teamFormationDeadline` (students; defaults to `submissionStartAt`), `teamCompletionDeadline`
(faculty; defaults to the formation deadline, which means no faculty window), `ideaDeadline`
(defaults to the completion deadline) and `kind` (`CORE` for the whole batch, `ELECTIVE` for
enrolled students only). The three deadlines come in that order, no later than
`submissionStartAt`. The rules are in
[teams.md](docs/architecture/teams.md).

## Future work: faculty CSV import

The university will provide a CSV of faculty names and emails. The plan is
`POST /api/admin/faculty-allowlist/import`, taking `name,email` rows:

- validate every row against the staff pattern and report invalid rows (student emails included);
- upsert valid rows into `FacultyAllowlistEntry` with `source = CSV_IMPORT`;
- auto-approve matching pending access requests.

It is one new `FacultyAccessService` method. The table already has the `source` column, and login
reads the allowlist through `FacultyDirectory`, so `SignInService` and `RoleResolver` do not change.

## Documentation

- [Phase 3 baseline analysis](docs/analysis/phase3-auth-baseline.md) and
  [test report](docs/testing/phase3-test-report.md)
- [Phase 4 baseline analysis](docs/analysis/phase4-teams-baseline.md) and
  [test report](docs/testing/phase4-test-report.md)
- [Phase 5 test report](docs/testing/phase5-test-report.md) (team completion, electives, demo
  accounts)
- [Phase 6 test report](docs/testing/phase6-test-report.md) (ideas, pre-registered students)
- [Phase 7 test report](docs/testing/phase7-test-report.md) (idea list, open-ended rounds,
  submissions)
- [Architecture: foundation](docs/architecture/foundation.md),
  [course cycles](docs/architecture/course-cycles.md),
  [authentication and RBAC](docs/architecture/auth-and-rbac.md),
  [teams](docs/architecture/teams.md),
  [ideas and pre-registered students](docs/architecture/ideas.md),
  [submissions](docs/architecture/submissions.md)
- Decisions: [001 Google Sign-In](docs/decisions/001-google-sign-in-domain-restricted.md),
  [002 server-side roles](docs/decisions/002-roles-resolved-server-side.md),
  [003 Google sub](docs/decisions/003-identify-users-by-google-sub.md),
  [004 refresh rotation](docs/decisions/004-refresh-token-rotation-and-reuse-detection.md),
  [005 per-request version check](docs/decisions/005-per-request-token-version-check.md),
  [006 dev identity provider](docs/decisions/006-dev-identity-provider.md),
  [007 leader forms the team](docs/decisions/007-leader-forms-team-without-invitations.md),
  [008 one team per student in the database](docs/decisions/008-one-team-per-student-enforced-by-database.md),
  [009 team rules and formation deadline](docs/decisions/009-team-rules-and-formation-deadline.md),
  [010 elective rosters](docs/decisions/010-elective-rosters-and-removal-checks.md),
  [011 faculty team completion and auto-group](docs/decisions/011-faculty-team-completion-and-auto-group.md),
  [012 pre-registered students](docs/decisions/012-pre-registered-students.md),
  [013 project ideas](docs/decisions/013-project-ideas.md),
  [014 idea list and open-ended rounds](docs/decisions/014-idea-catalog-and-open-ended-rounds.md),
  [015 versioned submissions](docs/decisions/015-versioned-submissions.md)
