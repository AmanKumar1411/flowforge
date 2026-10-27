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

## Data and security decisions

Users are identified by the unique Google `sub`; `User.email` is unique and normalized. No passwords are stored. `JwtAuthGuard` and `RolesGuard` are global, with an explicit `@Public()` opt-out, and every request reads the user's role, status and `tokenVersion` by primary key. Resource-level rules stay in policy objects such as `CycleAuthorizationPolicy`. Global DTO validation strips or rejects unexpected fields. CORS accepts only `FRONTEND_URL` and uses credentials. Every error has the shape `{ code, message }`.

Prisma 7 uses `prisma.config.ts`, a generated CJS client under an ignored output path, and the PostgreSQL driver adapter. The initial migration is the source of truth for recreating the schema.

## Extension direction

New lifecycle modules get authentication for free from the global guards; they declare `@Roles(...)` on each route, read the caller with `@CurrentUser()`, and depend on exported services rather than other modules' repositories. Add a module per bounded concern when the domain arrives; do not introduce queues, microservices, Redis, or orchestration infrastructure until a concrete requirement requires them.
