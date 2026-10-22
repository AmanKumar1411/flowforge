# FlowForge V1 foundation architecture

## Scope

V1 implements one deployable NestJS API, one PostgreSQL database, and one React/Vite client. Phase 2 adds faculty-owned course/project cycles while leaving teams, project ideas, submissions, evaluations, and scaling infrastructure for later phases.

## Backend boundaries

`AppModule` assembles configuration, Prisma, and authentication. `ConfigModule` validates all required environment variables before the app bootstraps. `PrismaService` is the single Prisma client, connects at module initialization, and disconnects on shutdown.

`AuthController` owns HTTP request/response handling. `AuthService` owns registration, password hashing/verification, and token issuance. `UsersRepository` contains the User persistence calls. The service depends on the runtime abstract class `UniversityIdentityParser`; `AuthModule` binds that abstraction to `RishihoodIdentityParser`.

The parser is called only during registration. It trims and lower-cases the address, checks the exact domain part against configuration, then applies one anchored configured local-part pattern. The named `batch` capture is converted with `BATCH_BASE_YEAR`. If a valid domain has no batch token, the persisted `batchYear` is `null`. Login and protected requests use the persisted User/token state and do not re-parse identity.

## Data and security decisions

`User.email` is unique, `passwordHash` is never returned from the auth service, and passwords are hashed with bcrypt at cost 12. JWT verification is in `JwtAuthGuard`; authorization policy can be added independently of authentication guards as protected resources appear. Global DTO validation strips or rejects unexpected fields. CORS accepts explicit configured origins only and uses credentials.

Prisma 7 uses `prisma.config.ts`, a generated CJS client under an ignored output path, and the PostgreSQL driver adapter. The initial migration is the source of truth for recreating the schema.

## Extension direction

New lifecycle modules should depend on the exported Prisma module and public auth guards, not instantiate Prisma or parsers directly. Add a module per bounded concern when the domain arrives; do not introduce queues, microservices, Redis, or orchestration infrastructure until a concrete requirement requires them.
