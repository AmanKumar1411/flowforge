# Phase 3 baseline: authentication and RBAC

Snapshot of the repository before Phase 3 (Google Sign-In, RBAC, sessions) starts.
Commit analysed: `648cc92` on `main`.

## 1. Baseline results

| Check | Result |
| --- | --- |
| `git status` | Clean after commit `648cc92`; pushed to the private GitHub repo `AmanKumar1411/flowforge` |
| backend `npm run build` | Pass |
| backend `npm test` | Pass: 4 suites, 24 tests |
| backend `npm run lint` | Pass, no warnings |
| backend `prisma validate` | Pass |
| backend `prisma migrate status` | **Not run**: Docker Desktop is paused, so PostgreSQL at `localhost:5432` is unreachable (P1001) |
| frontend `npm run build` | Pass (233 kB JS, 6.7 kB CSS) |
| frontend `npm run lint` | Pass |
| `docker compose -f infra/docker-compose.yml ps` | **Not run**: Docker Desktop is paused |

The integration scenario (`npm run test:integration`) needs PostgreSQL and a `flowforge_test`
database, so it was not run either.

## 2. Current structure

Stack: NestJS 12, Prisma 7 (generated CJS client in `src/generated/prisma`, `pg` driver adapter),
PostgreSQL in Docker, React 19 + Vite 8 frontend. No Passport, Swagger, helmet, throttler or
cookie-parser is installed.

```
backend/src/
├── main.ts                       createApp(): /api prefix, CORS, global ValidationPipe
├── app.module.ts                 Config (validated), Prisma, Auth, CourseCycles
├── auth/
│   ├── auth.controller.ts        POST register, POST login, GET me
│   ├── auth.module.ts            JwtModule (1h, secret from JWT_SECRET), parser binding
│   ├── auth.service.ts           bcrypt hashing, JWT issuing, JwtPayload type
│   ├── users.repository.ts       Prisma User calls
│   ├── domain/                   university-identity-parser.ts (abstract port + error)
│   ├── dto/                      login.dto.ts, register.dto.ts
│   ├── guards/                   jwt-auth.guard.ts, roles.guard.ts, roles.decorator.ts
│   └── infrastructure/           rishihood-identity-parser.ts (+ spec)
├── config/
│   └── env.validation.ts         hand-written validate() (+ spec)
├── course-cycles/                Phase 2
│   ├── course-cycle.controller.ts
│   ├── course-cycle.service.ts   (+ spec)
│   ├── course-cycles.module.ts
│   ├── domain/                   policy, repository port, workflow (+ spec), errors, types,
│   │                             in-memory repository
│   ├── dto/                      create, update, response
│   └── infrastructure/           prisma-cycle.repository.ts
├── prisma/                       PrismaModule (global), PrismaService
└── generated/prisma/             generated, git-ignored
backend/test/
└── course-cycles.integration.ts  ts-node script with node:assert (not Jest)
```

### Conventions found (Phase 3 follows them)

- Ports are **abstract classes**, used directly as Nest DI tokens (`CycleRepository`,
  `UniversityIdentityParser`). No string or symbol tokens.
- Domain errors carry a typed `code` union (`CycleDomainError`) and are turned into `{ code, message }`.
- Domain value types are string unions (`CycleStatus = "DRAFT" | ...`), not TS enums.
- File names are kebab-case with a role suffix (`prisma-cycle.repository.ts`, `course-cycle.service.ts`).
- Unit specs sit next to the code as `*.spec.ts`; the integration test lives in `backend/test/`.
- Prettier formatting with double quotes; `no-explicit-any` is an error.

### Current authentication

| Endpoint | Behaviour |
| --- | --- |
| `POST /api/auth/register` | `{ name, email, password, role }`. Parses the email, bcrypt-hashes (cost 12), stores the user with **the role the client sent**, returns a JWT |
| `POST /api/auth/login` | `{ email, password }`. Compares bcrypt, returns a JWT |
| `GET /api/auth/me` | Returns the decoded JWT claims |

- **JWT:** `@nestjs/jwt`, HS256 by default, expiry `1h` hard-coded in `auth.module.ts`.
  Claims: `{ sub, email, role, batchYear }`. No `iss`, no `aud`, algorithm not pinned on verify.
- **`JwtAuthGuard`:** a hand-written `CanActivate` that verifies the bearer token and puts the decoded
  claims on `request.user`. There is no Passport strategy and no database lookup.
- **`RolesGuard` and `@Roles()`:** read `request.user.role`. Applied per controller with `@UseGuards`.
- **`RishihoodIdentityParser`:** checks the exact domain against `ALLOWED_UNIVERSITY_EMAIL_DOMAINS`,
  then runs `BATCH_EMAIL_PATTERN` (`^[a-z0-9]+\.k(?<batch>\d{2})[a-z0-9]*$`) on the local part only.
  Any address that doesn't match gets `batchYear: null` instead of being denied. There is no batch
  range check. The spec has to mock `@nestjs/common` because the parser is an `@Injectable` that
  reads `ConfigService`.

### Prisma schema

- Enums: `UserRole { STUDENT, FACULTY }`, `CycleStatus { DRAFT, PUBLISHED, CLOSED }`.
- `User`: `id` (uuid), `name`, `email` (unique), `passwordHash`, `role`, `batchYear?`, timestamps;
  indexes on `role` and `batchYear`.
- `CourseProjectCycle`: owner FK `createdByFacultyId → User` (`ON DELETE RESTRICT`); indexes on
  `(createdByFacultyId, createdAt)` and `(batchYear, status, publishedAt)`.
- Migrations: `20260930000000_init_user_identity` and `20260930122159_add_course_project_cycles`.
  The second one adds a hand-written `CHECK (submissionStartAt < submissionDeadline)` that
  `schema.prisma` does not describe.

### Config and env validation

`ConfigModule.forRoot({ validate: validateEnvironment })` requires `DATABASE_URL` (postgres URL),
`JWT_SECRET` (≥ 32 chars), `ALLOWED_UNIVERSITY_EMAIL_DOMAINS`, `BATCH_EMAIL_PATTERN` (anchored, with
a named `batch` group, plus a simple ReDoS heuristic), `BATCH_BASE_YEAR`, `CORS_ORIGIN` (no `*`) and
`PORT`. `NODE_ENV` is not validated.

### Phase 2 course-cycle module

- **Current user:** `@Req()` plus a `currentUser()` helper that casts `request.user` to `JwtPayload`.
  The service takes `JwtPayload` and maps it to `CycleActor { id, role, batchYear }`.
  **Role and batch come from the token**, so they can be up to 1 hour stale.
- **Role checks:** `@UseGuards(JwtAuthGuard, RolesGuard)` on the class. `@Roles(FACULTY)` on
  create, `/my`, update, publish and close; `@Roles(STUDENT)` on `GET /course-cycles`; no role
  restriction on `GET /:id`.
- **Ownership:** `CycleAuthorizationPolicy.assertOwner`: a non-owner gets `NOT_CYCLE_OWNER` (403).
- **Batch filtering:** `listPublishedForBatch(actor.batchYear)` in the repository. On `GET /:id`,
  a draft or closed cycle gives `CYCLE_NOT_FOUND` (404) and another batch gives
  `UNAUTHORIZED_BATCH_ACCESS` (403).
- **Errors:** `CourseCycleService.toHttpException` maps codes to status, and the controller wraps
  every call in `run()`.

### Frontend

- Single `App.tsx` (748 lines). Hand-rolled routing with `history.pushState`. Routes:
  `/faculty/cycles[/new|/:id|/:id/edit]` and `/student/cycles[/:id]`; with no token it shows the login screen.
- Auth state: **access token and user are stored in `localStorage`**. Email + password login form.
- API client (`api.ts`): token passed in by hand to each call, no `credentials`, no 401 handling or refresh.
- `types.ts`: `UserRole = 'STUDENT' | 'FACULTY'`. No frontend tests.

### Existing tests

| Suite | Tests | Covers |
| --- | ---: | --- |
| `config/env.validation.spec.ts` | 3 | valid env, bad DB URL, unsafe batch pattern |
| `auth/infrastructure/rishihood-identity-parser.spec.ts` | 8 | `.k23/.k24/.k25`, case and whitespace, wrong domain, no batch → `null` |
| `course-cycles/domain/cycle-workflow.spec.ts` | 8 | transition table, editable fields, deadline rule |
| `course-cycles/course-cycle.service.spec.ts` | 5 | lifecycle, ownership, batch visibility, student cannot create |
| `test/course-cycles.integration.ts` (not Jest) | 1 scenario | full HTTP flow on real PostgreSQL, using **register + login** |

## 3. Keep, change, remove

**Keep**
- `PrismaModule` / `PrismaService`, the `/api` prefix, the global `ValidationPipe` settings.
- The function-style `validateEnvironment` (extended, not replaced).
- The whole course-cycle domain: workflow, repository port, Prisma repository, DTOs, state machine.
- `UniversityIdentityParser` as a port and `RishihoodIdentityParser` as its implementation (rewritten).
- The `@Roles()` + `RolesGuard` idea (made global and backed by a database lookup).

**Change**
- `User` model: add `googleSub`, `status`, `tokenVersion`, `avatarUrl`, `lastLoginAt`; add
  `ADMIN` and `PENDING_STAFF` to the role enum; drop `passwordHash`.
- Parser: new student and staff patterns applied to the full email; it classifies the email as
  student, staff or unrecognised and **denies instead of returning `null`**; adds a batch range check.
- Env: `JWT_SECRET` → `JWT_ACCESS_SECRET`, `CORS_ORIGIN` → `FRONTEND_URL`,
  `ALLOWED_UNIVERSITY_EMAIL_DOMAINS` → `ALLOWED_HOSTED_DOMAIN`,
  `BATCH_EMAIL_PATTERN` → `STUDENT_EMAIL_PATTERN` + `STAFF_EMAIL_PATTERN`; new Google, cookie and
  session keys.
- `JwtAuthGuard` / `RolesGuard`: global, `@Public()` opt-out, role and batch loaded from the database on every request.
- Course cycles: take an `AuthenticatedUser` from `@CurrentUser()` instead of `JwtPayload`;
  explicit per-role branches in the policy; errors go through one global filter.
- `UsersRepository` moves from `auth/` to a new `users/` module.
- Frontend: access token in memory, refresh cookie, auth context, role routes, `/admin`, `/pending`.
- Integration tests: move to Jest with a real database and dev-login instead of register.

**Remove**
- `POST /auth/register`, `POST /auth/login`, `RegisterDto`, `LoginDto`, `bcrypt`, `@types/bcrypt`,
  `passwordHash`, the `localStorage` token, and the password form.

## 4. Layering violations and design problems found

1. **Privilege escalation (critical).** `RegisterDto.role` is chosen by the client, so anyone with a
   university email can register as `FACULTY`. The Phase 2 integration test relies on this.
2. **Authorization data trusted from the token.** Role and batch are JWT claims valid for 1 hour.
   There is no way to revoke a session, deactivate a user or change a role quickly.
3. **JWT verification is loose.** No `iss` or `aud` check and the algorithm isn't pinned on verify.
   The expiry is hard-coded.
4. **Cross-module coupling.** `course-cycles` (service, spec and controller) imports `JwtPayload`
   from `auth/auth.service.ts`, so the token's shape leaks into another module's application layer.
5. **HTTP concerns in the application layer.** `CourseCycleService` imports `HttpException` and
   `BadRequestException` and owns the status mapping, and the controller wraps each call in a
   try/catch. Error shapes are inconsistent: domain errors are `{ code, message }`, while validation,
   academic-year and auth errors use Nest's default `{ statusCode, message, error }`.
6. **Policy allows unknown roles.** `findById` treats every non-FACULTY role as a student, and
   `assertStudentBatchAccess` returns early for non-students. Once `ADMIN` or `PENDING_STAFF` exist,
   they could read drafts. This must become an explicit per-role decision that denies by default.
7. **Guards are opt-in.** Any new controller is public unless someone remembers `@UseGuards`.
   `JwtAuthGuard` and `RolesGuard` are also provided a second time in `CourseCyclesModule`.
8. **Parser semantics.** It only accepts surname initial `k`, fails when there is no surname, guesses
   `null` for unknown shapes, and has no batch range check. It can't be tested without mocking Nest.
9. **No `Clock`.** `CourseCycleService.publish/close` and the in-memory repository call `new Date()`.
10. **Ownership of the User table.** `UsersRepository` sits inside `auth/`; there is no `users` module.
11. **Integration test** is a standalone ts-node script, isn't part of `npm test`, and uses email
    shapes (`phase2-faculty-a<ts>`, `phase2student.k26csai<ts>`) that the new patterns reject.
12. **Frontend:** the token in `localStorage` can be stolen by XSS; there are no route guards; the
    whole UI is in one file.

No Prisma calls outside repositories were found (good). The only exception is cleanup in the
integration test, which is acceptable.

## 5. Risks for this phase

| # | Risk | Mitigation |
| --- | --- | --- |
| R1 | The Phase 2 integration test depends on `/auth/register` with a client-chosen role, and its emails fail the new patterns | Rewrite it to use dev-login with valid student and staff emails (step 7) |
| R2 | Phase 2 unit tests build `JwtPayload` fixtures (`sub`, `email`, `role`, `batchYear`) | Update the fixtures when the actor type becomes `AuthenticatedUser` |
| R3 | **Conflict:** Part D asks for "other-owner resource → 404", but the existing Phase 2 tests and docs assert **403** (`NOT_CYCLE_OWNER`, `UNAUTHORIZED_BATCH_ACCESS`) | Needs a decision before step 6 (see summary) |
| R4 | The `/api` global prefix means real paths are `/api/auth/...`, but the spec's `GOOGLE_REDIRECT_URI` and refresh-cookie `path=/auth` omit it | Keep the prefix: redirect URI `.../api/auth/google/callback`, cookie path `/api/auth` |
| R5 | The OAuth `state` cookie must survive the cross-site redirect from Google; `SameSite=Strict` would drop it | State cookie uses `SameSite=Lax` (10 min, signed, httpOnly); the refresh cookie stays `Strict` |
| R6 | `SameSite=Strict` refresh cookie needs the frontend and API on the same site. `localhost:5173` and `localhost:3000` are same-site; production must be too (e.g. `app.` and `api.` on one domain) | Document in ADR 004 and the README |
| R7 | Refresh races: React StrictMode runs effects twice in development, and two tabs can refresh at once. Either would trigger reuse detection and log the user out | Single-flight refresh inside a tab, plus a Web Locks `navigator.locks` lock across tabs (cookies are shared, so a serialized second refresh sends the new cookie) |
| R8 | Throttling (10 logins per minute per IP) would break integration tests that log in many times from `127.0.0.1` | Make the limits configurable through env; the test env raises them |
| R9 | Docker is paused: migrations and integration tests can't run. Whether `flowforge_test` exists is unknown | Unpause Docker. The new migration replaces the schema, so the dev database will be **reset** (there's no production data) |
| R10 | `backend/.env` uses the old variable names; the app will refuse to boot after the config change | Update `.env.example`; you add the new secrets locally (they're never committed) |
| R11 | New dependencies must be compatible with NestJS 12 and Prisma 7 | Check peer ranges before installing: `@nestjs/swagger`, `@nestjs/throttler`, `google-auth-library`, `helmet`, `cookie-parser` |
| R12 | Google OAuth can't be exercised end to end in automated tests | Fake Google behind the `IdentityProvider` port; manual Google Cloud setup is described in the README |
| R13 | A real student whose address doesn't fit the pattern is denied and has no account an admin could fix | The pattern is configurable; denials are audited with the email so the coordinator can see them |
| R14 | The large `App.tsx` rewrite could regress Phase 2 screens, and there are no frontend tests | Keep the cycle components unchanged; move them into files; manual smoke test plus build and lint |

## 6. Design decisions taken during analysis

- **No Passport.** The existing guard is a plain `CanActivate`; adding Passport for one JWT check
  adds indirection without benefit. `strategies/` will hold a plain `AccessTokenStrategy` class
  (verify, then the database check), called by the global guard.
- **Ports stay abstract classes**, matching `CycleRepository` and `UniversityIdentityParser`.
- **Domain classes are plain TypeScript** built with `useFactory` in modules, so their specs need no
  Nest mocks.
- **Pattern overlap is impossible by construction.** The student pattern needs exactly two digits
  after the optional letters; the staff pattern allows at most one trailing digit. A unit test
  checks this on sample emails.
