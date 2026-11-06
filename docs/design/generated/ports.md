# Ports and their implementations

Generated from the TypeScript AST of `backend/src` by `npm run docs:ports`. Do not edit by hand.

27 abstract classes.

| Abstract class | Declared in | Production implementations | Test implementations |
| --- | --- | --- | --- |
| `AuditRepository` | `backend/src/audit/domain/audit.repository.ts` | `PrismaAuditRepository` | none |
| `DevIdentityProvider` | `backend/src/auth/application/ports/dev-identity-provider.ts` | `LocalDevIdentityProvider` | none |
| `FacultyDirectory` | `backend/src/auth/application/ports/faculty-directory.ts` | `PrismaFacultyDirectory` | none |
| `IdentityProvider` | `backend/src/auth/application/ports/identity-provider.ts` | `GoogleIdentityProvider`, `LoggingIdentityProvider` | `StubProvider` |
| `RefreshTokenRepository` | `backend/src/auth/application/ports/refresh-token.repository.ts` | `PrismaRefreshTokenRepository` | `InMemoryRefreshTokenRepository` |
| `TokenSigner` | `backend/src/auth/application/ports/token-signer.ts` | `JwtTokenSigner` | none |
| `UniversityIdentityParser` | `backend/src/auth/domain/university-identity-parser.ts` | `RishihoodIdentityParser` | none |
| `GoogleOAuthClient` | `backend/src/auth/infrastructure/google-oauth.client.ts` | `GoogleAuthLibraryClient` | `FakeGoogle` |
| `Clock` | `backend/src/common/clock.ts` | `SystemClock` | `FixedClock` |
| `RandomSource` | `backend/src/common/random.ts` | `CryptoRandomSource` | `SeededRandom` |
| `RateLimiter` | `backend/src/common/rate-limit.ts` | `PostgresRateLimiter` | `InMemoryRateLimiter` |
| `TransactionRunner` | `backend/src/common/transaction.ts` | `PrismaTransactionRunner` | `ImmediateTransactionRunner` |
| `CycleRepository` | `backend/src/course-cycles/application/ports/cycle.repository.ts` | `PrismaCycleRepository` | `InMemoryCycleRepository` |
| `StudentSources` | `backend/src/dashboard/application/ports/student-sources.ts` | `ModulesStudentSources` | none |
| `EvaluationRepository` | `backend/src/evaluations/application/ports/evaluation.repository.ts` | `PrismaEvaluationRepository` | none |
| `GradingSources` | `backend/src/evaluations/application/ports/grading-sources.ts` | `ModulesGradingSources` | none |
| `DatabaseProbe` | `backend/src/health/application/ports/database-probe.ts` | `PrismaDatabaseProbe` | none |
| `IdeaCatalogRepository` | `backend/src/ideas/application/ports/idea-catalog.repository.ts` | `PrismaIdeaCatalogRepository` | `InMemoryIdeaCatalogRepository` |
| `IdeaTeams` | `backend/src/ideas/application/ports/idea-teams.ts` | `TeamsIdeaTeams` | `FakeIdeaTeams` |
| `IdeaRepository` | `backend/src/ideas/application/ports/idea.repository.ts` | `PrismaIdeaRepository` | `InMemoryIdeaRepository` |
| `SubmissionTeams` | `backend/src/submissions/application/ports/submission-teams.ts` | `IdeasSubmissionTeams` | `FakeSubmissionTeams` |
| `SubmissionRepository` | `backend/src/submissions/application/ports/submission.repository.ts` | `PrismaSubmissionRepository` | `InMemorySubmissionRepository` |
| `StudentDirectory` | `backend/src/teams/application/ports/student-directory.ts` | `UsersStudentDirectory` | `InMemoryStudentDirectory` |
| `TeamCycles` | `backend/src/teams/application/ports/team-cycles.ts` | `CourseCycleTeamCycles` | none |
| `TeamSeekerRepository` | `backend/src/teams/application/ports/team-seeker.repository.ts` | `PrismaTeamSeekerRepository` | `InMemoryTeamSeekerRepository` |
| `TeamRepository` | `backend/src/teams/application/ports/team.repository.ts` | `PrismaTeamRepository` | `InMemoryTeamRepository` |
| `UsersRepository` | `backend/src/users/domain/users.repository.ts` | `PrismaUsersRepository` | none |
