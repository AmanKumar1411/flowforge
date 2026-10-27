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

Teams, ideas, submissions and evaluations come later.

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

### Who gets which role

| Email | Role on login |
| --- | --- |
| Student shape, e.g. `aman.k23csai@`, `rahul.25@`: two-digit admission year | `STUDENT`, batch `2000 + YY` (set once; admins can correct it) |
| Staff shape, e.g. `prakriti.p@`, `sahil.a2@`, listed in `ADMIN_BOOTSTRAP_EMAILS` | `ADMIN` |
| Staff shape on the faculty allowlist | `FACULTY` |
| Any other staff shape | `PENDING_STAFF` until an admin approves the access request |
| Anything else | Denied (`EMAIL_NOT_ELIGIBLE`) |

A student email can never become FACULTY or ADMIN. See [ADR 002](docs/decisions/002-roles-resolved-server-side.md).

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
| `REFRESH_TOKEN_TTL_DAYS`, `REFRESH_FAMILY_MAX_DAYS` | Refresh token (7 days) and absolute session (30 days) |
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
| `npm test` | Jest unit tests (domain rules, sessions, config, Google token verification) |
| `npm run test:integration` | `node:test` against real PostgreSQL `flowforge_test`: Google flow (Google faked at its network boundary), faculty access, sessions, admin, RBAC matrix, boot checks, Phase 2 scenario |

Integration tests use `TEST_DATABASE_URL` if set; otherwise they take `DATABASE_URL` from
`backend/.env` and switch the database to `flowforge_test`. They refuse to run against any other
database and truncate its tables between tests. Jest cannot load NestJS 12's ES modules on
Node 22, which is why integration tests use Node's built-in runner.

In `frontend/`: `npm run build` and `npm run lint`.

A browser end-to-end check of the sign-in flows lives in [e2e/browser](e2e/browser/README.md). The
latest results are in the [Phase 3 test report](docs/testing/phase3-test-report.md).

## API

All routes use the `/api` prefix and every error is `{ code, message }`. Interactive docs:
`/api/docs` (not served in production).

| Method | Path | Access |
| --- | --- | --- |
| GET | `/auth/google` | public, redirects to Google |
| GET | `/auth/google/callback` | public, Google redirects here |
| POST | `/auth/dev-login` | public, development only, Origin checked |
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
- [Architecture: foundation](docs/architecture/foundation.md),
  [course cycles](docs/architecture/course-cycles.md),
  [authentication and RBAC](docs/architecture/auth-and-rbac.md)
- Decisions: [001 Google Sign-In](docs/decisions/001-google-sign-in-domain-restricted.md),
  [002 server-side roles](docs/decisions/002-roles-resolved-server-side.md),
  [003 Google sub](docs/decisions/003-identify-users-by-google-sub.md),
  [004 refresh rotation](docs/decisions/004-refresh-token-rotation-and-reuse-detection.md),
  [005 per-request version check](docs/decisions/005-per-request-token-version-check.md),
  [006 dev identity provider](docs/decisions/006-dev-identity-provider.md)
