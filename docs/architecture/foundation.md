# FlowForge V1 foundation architecture

## Scope

V1 implements one deployable NestJS API, one PostgreSQL database, and one React/Vite client. Phase 2 adds faculty-owned course/project cycles while leaving teams, project ideas, submissions, evaluations, and scaling infrastructure for later phases.

## Backend boundaries

`AppModule` assembles configuration, Prisma, and authentication. `ConfigModule` validates all required environment variables before the app bootstraps. `PrismaService` is the single Prisma client, connects at module initialization, and disconnects on shutdown.

Phase 3 replaced password authentication with Google Sign-In restricted to the university domain,
server-side roles and refresh-token sessions; see [auth-and-rbac.md](auth-and-rbac.md) and the
[decision records](../decisions/). The `auth` module is layered into `domain/` (pure rules such as
`RoleResolver` and `BatchYearPolicy`), `application/` (services and ports), `infrastructure/`
(Google, JWT and Prisma adapters) and `presentation/` (controller, global guards, decorators).
`users` owns the User table and `audit` owns the append-only audit log.

`UniversityIdentityParser` is bound to `RishihoodIdentityParser`, which classifies the normalized
address as student (with the two-digit admission year from `STUDENT_EMAIL_PATTERN`), staff
(`STAFF_EMAIL_PATTERN`) or unrecognized. Unrecognized addresses are denied, never guessed.
`batchYear` is set once when the user is created; later logins and requests use the persisted value.

Phase 4 adds a layered `teams` module (see [teams.md](teams.md)). It reads cycles and users only
through ports whose adapters call `CourseCycleService` and `UsersService`.

## Running and scaling (Phase 10)

[ADR 024](../decisions/024-scaling-the-api.md):

- **Processes:** `npm start` runs `src/cluster.ts`, `API_WORKERS` processes on one port. Boot is refused when their pools (`API_WORKERS × DB_POOL_MAX`) exceed `DB_MAX_CONNECTIONS − DB_CONNECTION_HEADROOM`. A worker that dies is replaced, and SIGTERM lets the workers finish their requests. `npm run start:single` runs one process.
- **Health:** `GET /api/health` is public. It answers 200 when the database runs a query, and 503 otherwise.
- **Per-request memo:** `RequestScope` (AsyncLocalStorage, opened by a Nest middleware after body parsing) memoizes a cycle, a team and a cycle's teams for one request. Transactions bypass it, and repositories forget on write. `test/query-budget.e2e.ts` holds each endpoint's statement budget.
- **Timeouts:** `keepAliveTimeout` is `HTTP_KEEP_ALIVE_TIMEOUT_MS` (65 s), `headersTimeout` one second more.
- **Bodies:** a body nested deeper than `MAX_BODY_DEPTH` (32) is `400 BODY_TOO_DEEP` before validation, checked by an iterative walk.
- **Text:** every free-text field carries `@IsCleanText()` (no control characters but tab and new lines), and a test checks that none is missing.
- **Errors:** the filter turns connection-level database errors into `503 SERVICE_UNAVAILABLE` and PostgreSQL's invalid-text error into `400 INVALID_TEXT`, without details.
- **Write limits:** every authenticated write counts against a per-user limit (`WriteRateLimitGuard`, 120 a minute).

## Data and security decisions

Users are identified by the unique Google `sub`; `User.email` is unique and normalized. No passwords are stored. `JwtAuthGuard` and `RolesGuard` are global, with an explicit `@Public()` opt-out, and every request reads the user's role, status and `tokenVersion` by primary key. Resource-level rules stay in policy objects such as `CycleAuthorizationPolicy`. Global DTO validation strips or rejects unexpected fields. CORS accepts only `FRONTEND_URL` and uses credentials. Every error has the shape `{ code, message }`.

Prisma 7 uses `prisma.config.ts`, a generated CJS client under an ignored output path, and the PostgreSQL driver adapter. The initial migration is the source of truth for recreating the schema.

## Extension direction

New lifecycle modules get authentication for free from the global guards; they declare `@Roles(...)` on each route, read the caller with `@CurrentUser()`, and depend on exported services rather than other modules' repositories. Add a module per bounded concern when the domain arrives; do not introduce queues, microservices, Redis, or orchestration infrastructure until a concrete requirement requires them.
