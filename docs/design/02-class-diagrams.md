# 2 · Class diagrams

These diagrams were checked against the code with `docs/design/scripts/list-ports.ts`, which reads the TypeScript
AST. See [section 2.5](#25-checking-the-diagrams-against-the-code).

**How the model is shaped.** FlowForge's entities are TypeScript **interfaces**: plain data that crosses modules and
comes back from repositories. Their behaviour lives in **pure rule classes** with no I/O (`CycleWorkflow`, `TeamRules`,
`IdeaRules`, `SubmissionRules`, `EvaluationRules`). So the diagrams show entities with attributes and rule classes with
methods. Real value objects with their own behaviour (`LinkRequirement`, `CycleRoster`) are classes.
[Doc 3](03-oop.md#weak-spots-found) discusses the trade-off.

**Types in the diagrams:** async methods show what the promise resolves to, a nullable result is shown without `| null` where it would crowd the box, and `object` means the code declares an inline return type.

**Arrows:** `*--` composition, `o--` aggregation, `-->` association or "uses", `<|--` inheritance (a class `extends`),
`..|>` realization (a class `implements` an interface).

## 2.1 The domain model

### Overview: how the entities connect

Every entity and its multiplicities, without attributes. The figures after it add the attributes, one area at a time.

```mermaid
classDiagram
  direction LR
  CourseProjectCycle "1" *-- "0..10" Milestone
  CourseProjectCycle "1" *-- "0..*" CycleEnrollment
  CourseProjectCycle "1" *-- "0..*" Team
  CourseProjectCycle "1" *-- "0..*" TeamSeeker
  CourseProjectCycle "1" *-- "0..*" CatalogIdea
  Team "1" *-- "1..*" TeamMember
  Team "1" *-- "0..1" ProjectIdea
  Team "1" *-- "0..*" Submission
  ProjectIdea "1" *-- "0..*" IdeaReview
  CatalogIdea "0..1" --> "0..*" ProjectIdea : picked as
  Milestone "1" --> "0..*" Submission : for
  Milestone "1" *-- "0..1" MilestoneGrading
  Milestone "1" *-- "0..*" Evaluation
  Team "1" --> "0..*" Evaluation : of
  Evaluation "1" *-- "1..*" EvaluationRevision
  User "1" *-- "0..*" RefreshToken
  User "1" *-- "0..1" FacultyAccessRequest
  User "1" --> "0..*" CourseProjectCycle : owns
  TeamMember "0..*" --> "1" User
  Team "0..*" --> "1" User : leader
```

**Where in the code:** `backend/prisma/schema.prisma`, `backend/src/course-cycles/domain/cycle.types.ts`,
`backend/src/teams/domain/team.ts`, `backend/src/ideas/domain/idea.ts`, `backend/src/submissions/domain/submission.ts`,
`backend/src/evaluations/domain/evaluation.ts`

### People and access

Who can use the system, how they stay signed in, and the audit trail.

```mermaid
classDiagram
  direction LR
  class User {
    <<interface>>
    +string id
    +string|null googleSub
    +string email
    +string name
    +Role role
    +UserStatus status
    +number|null batchYear
    +number tokenVersion
    +Date|null lastLoginAt
  }
  class FacultyAllowlistEntry {
    <<interface>>
    +string id
    +string email
    +FacultyAllowlistSource source
    +string addedById
  }
  class FacultyAccessRequest {
    <<interface>>
    +string id
    +string userId
    +string email
    +FacultyRequestStatus status
    +string|null decidedById
    +Date|null decidedAt
  }
  class RefreshTokenRecord {
    <<interface>>
    +string id
    +string userId
    +string familyId
    +string tokenHash
    +Date expiresAt
    +Date familyExpiresAt
    +Date|null revokedAt
    +string|null replacedById
  }
  class AuditEvent {
    <<interface>>
    +AuditAction action
    +string|null actorId
    +AuditEntityType entityType
    +string entityId
    +AuditMetadata metadata
  }
  class RoleResolver {
    +resolve(input) RoleResolution
    +assertCanBeElevated(identity) void
  }
  class BatchYearPolicy {
    +assertValid(batchYear) void
  }
  User "1" *-- "0..*" RefreshTokenRecord
  User "1" *-- "0..1" FacultyAccessRequest
  User "1" --> "0..*" FacultyAllowlistEntry : added
  User "0..1" --> "0..*" AuditEvent : actor
  RefreshTokenRecord "0..1" --> "0..1" RefreshTokenRecord : replacedBy
  RoleResolver --> User : decides role of
  BatchYearPolicy --> User : checks batch of
```

**Where in the code:** `backend/src/users/domain/user.ts`, `backend/src/auth/application/ports/faculty-directory.ts`,
`backend/src/auth/application/ports/refresh-token.repository.ts`, `backend/src/audit/domain/audit-event.ts`,
`backend/src/auth/domain/role-resolver.ts`, `backend/src/auth/domain/batch-year.policy.ts`

### The cycle aggregate

A cycle, its milestones and its roster, saved together, with the state machine and schedule rules.

```mermaid
classDiagram
  direction TB
  class Cycle {
    <<interface>>
    +string id
    +string courseName
    +string title
    +number batchYear
    +number minTeamSize
    +number maxTeamSize
    +Date teamDeadline
    +Date ideaDeadline
    +CycleIdeaSource ideaSource
    +LinkRequirement ideaLinkRequirement
    +Milestone[] milestones
    +CourseKind kind
    +CycleStatus status
    +string createdByFacultyId
    +Date|null publishedAt
    +Date|null closedAt
  }
  class Milestone {
    <<interface>>
    +string id
    +string cycleId
    +number position
    +string name
    +Date submissionOpensAt
    +Date submissionDueAt
    +Date evaluationAt
    +LinkRequirement linkRequirement
  }
  class Enrollment {
    <<interface>>
    +string email
    +Date createdAt
  }
  class LinkRequirement {
    +LinkType[] required
    +LinkType[] optional
    +from(raw)$ LinkRequirement
    +allows(type) boolean
    +equals(other) boolean
    +check(links, validators) Link[]
    +toJSON() LinkRequirementShape
  }
  class CycleWorkflow {
    +transition(status, action) CycleStatus
    +assertEditable(status, fields) void
    +assertValidSchedule(schedule) void
    +publishProblems(schedule) ScheduleProblem[]
    +assertStageDeadlineChange(deadline, current, next, now) void
    +assertPublishedMilestones(current, next, now) void
  }
  class MilestoneSchedule {
    +problems(schedule, options) ScheduleProblem[]
    +assertValid(schedule) void
    +assertPublishedChange(current, next, now) void
  }
  class CycleTimeline {
    +currentStage(cycle) CycleStage
    +upcomingEvents(cycle, limit) CycleEvent[]
  }
  class CycleRoster {
    +RosterScope scope
    +wholeBatch(batchYear)$ CycleRoster
    +enrolled(emails)$ CycleRoster
    +includes(person) boolean
    +describe() string
  }
  Cycle "1" *-- "0..10" Milestone
  Cycle "1" *-- "0..*" Enrollment
  Cycle "1" o-- "1" LinkRequirement : ideaLinkRequirement
  Milestone "1" o-- "1" LinkRequirement : linkRequirement
  CycleWorkflow "1" *-- "1" MilestoneSchedule
  CycleWorkflow --> Cycle : guards
  CycleTimeline --> Cycle : reads
  CycleRoster --> Cycle : built from
```

**Where in the code:** `backend/src/course-cycles/domain/cycle.types.ts`, `backend/src/course-cycles/domain/milestone.ts`,
`backend/src/course-cycles/domain/cycle-workflow.ts`, `backend/src/course-cycles/domain/milestone-schedule.ts`,
`backend/src/course-cycles/domain/cycle-timeline.ts`, `backend/src/course-cycles/domain/cycle-roster.ts`,
`backend/src/common/links/link-requirement.ts`

### Teams

A team, its members and its rules.

```mermaid
classDiagram
  direction LR
  class Team {
    <<interface>>
    +string id
    +string cycleId
    +string name
    +string leaderId
    +TeamOrigin origin
    +TeamMember[] members
  }
  class TeamMember {
    <<interface>>
    +string userId
    +string name
    +string email
    +string addedById
    +Date addedAt
  }
  class TeamSeeker {
    <<interface>>
    +string userId
    +string|null note
    +Date createdAt
  }
  class TeamRules {
    +isFormationOpen(cycle, now) boolean
    +isPlacementOpen(cycle, now) boolean
    +assertFormationOpen(cycle, now) void
    +assertPlacementOpen(cycle, now) void
    +assertSize(size, cycle) void
    +planMembers(team, requestedIds) MemberPlan
    +assertHasRoom(team, cycle) void
    +assertEligible(roster, requestedIds, found) void
    +assertAvailable(memberships, users, teamId) void
    +assertNoOverlap(teams) void
  }
  class TeamAccessPolicy {
    +canRead(actor, team, cycle) boolean
    +assertCanRead(actor, team, cycle) void
    +assertCycleOwner(actor, team, cycle) void
    +assertLeader(actor, team, cycle) void
  }
  class TeamAllocator {
    +sizes(count, min, max)$ number[]
    +allocate(studentIds, min, max) Allocation
  }
  Team "1" *-- "1..*" TeamMember
  Team "1" o-- "1..*" User : members, through TeamMember
  TeamMember "0..*" --> "1" User
  TeamSeeker "0..*" --> "1" User
  TeamRules --> Team : guards
  TeamAccessPolicy --> Team : decides who sees
  TeamAllocator --> Team : proposes
```

**Where in the code:** `backend/src/teams/domain/team.ts`, `backend/src/teams/domain/team-rules.ts`,
`backend/src/teams/domain/team-access.policy.ts`, `backend/src/teams/domain/team-allocator.ts`

### Ideas

A team's one current idea, its reviews and the faculty's catalog.

```mermaid
classDiagram
  direction LR
  class Idea {
    <<interface>>
    +string id
    +string teamId
    +string cycleId
    +string title
    +string problem
    +string|null solution
    +Link[] links
    +IdeaSource source
    +string|null catalogIdeaId
    +IdeaStatus status
    +number version
    +Person submittedBy
    +Date submittedAt
    +IdeaReview[] reviews
  }
  class IdeaReview {
    <<interface>>
    +number version
    +IdeaDecision decision
    +string|null feedback
    +Person reviewer
    +Date reviewedAt
  }
  class CatalogIdea {
    <<interface>>
    +string id
    +string cycleId
    +string title
    +string description
    +string|null link
    +number pickCount
  }
  class IdeaRules {
    +submissionAction(current, cycle, now) SubmissionAction
    +assertCanReview(idea, cycle, seenVersion) void
    +feedbackFor(decision, raw) string|null
    +clean(content, cycle) IdeaVersionContent
    +pickContent(catalogIdea) IdeaVersionContent
    +assertCanRemove(catalogIdea) void
    +cleanCatalog(content) CatalogIdeaContent
  }
  class Link {
    <<interface>>
    +LinkType type
    +string url
  }
  Idea "1" *-- "0..*" IdeaReview
  Idea "1" *-- "0..*" Link
  CatalogIdea "0..1" --> "0..*" Idea : picked as
  IdeaRules --> Idea : guards
  IdeaRules --> CatalogIdea : copies from
```

**Where in the code:** `backend/src/ideas/domain/idea.ts`, `backend/src/ideas/domain/idea-rules.ts`,
`backend/src/common/links/link-type.ts`

### Work and evaluations

Versioned submissions, a milestone's grading, and private evaluations with their history.

```mermaid
classDiagram
  direction TB
  class Submission {
    <<interface>>
    +string id
    +string teamId
    +string cycleId
    +string milestoneId
    +number version
    +Link[] links
    +string|null notes
    +Person submittedBy
    +Date submittedAt
  }
  class MilestoneGrading {
    <<interface>>
    +string milestoneId
    +number|null maxMarks
    +Date|null releasedAt
    +string|null releasedById
  }
  class Evaluation {
    <<interface>>
    +string id
    +string milestoneId
    +string teamId
    +string cycleId
    +number|null marks
    +string|null feedback
    +number version
    +string evaluatedById
  }
  class EvaluationRevision {
    <<table only>>
    +string evaluationId
    +number version
    +number|null marks
    +string|null feedback
    +string evaluatedById
  }
  class SubmissionRules {
    +milestoneOf(cycle, milestoneId) SubmissionMilestone
    +window(cycle, milestone, now) SubmissionWindow
    +assertCanSubmit(actor, team, cycle, milestone, idea, now) void
    +assertBelowVersionLimit(latestVersion, limit) void
    +clean(content, milestone) SubmissionContent
  }
  class EvaluationRules {
    +isGradingOpen(cycle, milestone, now) boolean
    +assertGradingOpen(cycle, milestone, now) void
    +clean(input, grading, marksEnabled) EvaluationInput
    +nextVersion(current, expectedVersion) number
    +assertCanRelease(grading, graded) void
    +isUpdatedAfterRelease(evaluation, grading) boolean
  }
  class EvaluationPolicy {
    +isOwner(actor, cycle) boolean
    +assertCanReadGrading(actor, cycle) void
    +assertCanGrade(actor, cycle) void
    +assertCanReadTeam(actor, cycle, team) void
    +releasedOnly(actor) boolean
  }
  Team "1" *-- "0..*" Submission
  Milestone "1" --> "0..*" Submission : for
  Milestone "1" *-- "0..1" MilestoneGrading
  Milestone "1" *-- "0..*" Evaluation
  Team "1" --> "0..*" Evaluation : of
  Evaluation "1" *-- "1..*" EvaluationRevision
  Submission "1" *-- "1..*" Link
  SubmissionRules --> Submission : guards
  EvaluationRules --> Evaluation : guards
  EvaluationPolicy --> Evaluation : decides who sees
```

A submission has at least one link only when its milestone requires one, as `MILESTONE_DEFAULT` does; a milestone
requiring no links allows zero. The diagram shows the default.

**Where in the code:** `backend/src/submissions/domain/submission.ts`, `backend/src/submissions/domain/submission-rules.ts`,
`backend/src/evaluations/domain/evaluation.ts`, `backend/src/evaluations/domain/evaluation-rules.ts`,
`backend/src/evaluations/domain/evaluation-policy.ts`, `backend/src/evaluations/infrastructure/prisma-evaluation.repository.ts`

### Value objects

Objects with no identity, compared by value. All of them are immutable in use or built by a factory.

| Value object | Fields | Why it's a value | Where |
| --- | --- | --- | --- |
| `LinkRequirement` | `required`, `optional` | Private constructor, `readonly` fields, `equals`, checked when built | `backend/src/common/links/link-requirement.ts` |
| `CycleRoster` | `scope` | Private constructor, two factories | `backend/src/course-cycles/domain/cycle-roster.ts` |
| `Link` | `type`, `url` | Copied whole into an immutable version | `backend/src/common/links/link-type.ts` |
| `ExternalIdentity` | `sub`, `email`, `emailVerified`, `hostedDomain`, `name`, `picture` | What a provider vouches for, read once | `backend/src/auth/domain/external-identity.ts` |
| `UniversityIdentity` | `kind`, `email`, `batchYear` | A tagged union from parsing an email | `backend/src/auth/domain/university-identity-parser.ts` |
| `PendingAuthorization` | `state`, `nonce`, `codeVerifier` | One login's secrets, kept in a signed cookie | `backend/src/auth/application/ports/identity-provider.ts` |
| `RateLimitDecision` | `allowed`, `hits`, `retryAfterMs` | One outcome of counting | `backend/src/common/rate-limit.ts` |
| `CycleStage`, `CycleEvent` | computed | Computed from dates and the clock, never stored | `backend/src/course-cycles/domain/cycle-timeline.ts` |
| `TodoItem` | `key`, `kind`, `text`, `at`, `tab`, `actionable` | Computed for one dashboard read | `backend/src/dashboard/domain/student-todo-rules.ts` |

### Why each composition and aggregation

| Relationship | Kind | Justification |
| --- | --- | --- |
| `CourseProjectCycle` – `Milestone` | composition | **Aggregate rule:** `CycleRepository` saves them in one transaction ("the cycle aggregate"). `Milestone.cycleId` is a required FK, `onDelete: Restrict`, so a cycle with milestones can't be deleted out from under them |
| `CourseProjectCycle` – `CycleEnrollment` | composition | **Aggregate rule:** `CycleRepository` also owns the roster. `cycleId` is required and part of the primary key |
| `CourseProjectCycle` – `Team` | composition | `Team.cycleId` is required and never changes (`TeamChange` has no `cycleId`). `onDelete: Restrict`; there's no route that deletes a cycle |
| `CourseProjectCycle` – `TeamSeeker` | composition | `cycleId` is required and part of the primary key |
| `CourseProjectCycle` – `CatalogIdea` | composition | `cycleId` is required; a catalog is one cycle's list |
| `Team` – `TeamMember` | composition | Required composite FK, **`onDelete: Cascade`**: the rows go with the team |
| `Team` – `ProjectIdea` | composition | Required composite FK, **`onDelete: Cascade`**, unique `(teamId, cycleId)` |
| `ProjectIdea` – `IdeaReview` | composition | Required FK, **`onDelete: Cascade`** |
| `Team` – `Submission` | composition | Required composite FK. `onDelete: Restrict`: work can't lose its team. It has one owner in the diagram; the required FK to `Milestone` is an association |
| `Milestone` – `MilestoneGrading` | composition | The primary key **is** the FK to the milestone |
| `Milestone` – `Evaluation` | composition | Required composite FK. Results are graded and released per milestone. The required FK to `Team` is an association |
| `Evaluation` – `EvaluationRevision` | composition | Required FK, `onDelete: Restrict`, and append-only by trigger |
| `User` – `RefreshToken` | composition | Required FK. A session means nothing without its user |
| `User` – `FacultyAccessRequest` | composition | Required, unique FK |
| `Idea` or `Submission` – `Link` | composition | Stored inside the row's JSON column, with no life outside it |
| `CycleWorkflow` – `MilestoneSchedule` | composition | Created in the workflow's own field (`private readonly schedule = new MilestoneSchedule()`) |
| `Team` – `User` (through `TeamMember`) | aggregation | The membership row is removed with the team (`Cascade`), but the person remains: `TeamMember.userId` is `onDelete: Restrict` on the `User` side |
| `Cycle` or `Milestone` – `LinkRequirement` | aggregation | Instances are shared: `LinkRequirement.IDEA_DEFAULT` and `MILESTONE_DEFAULT` are static and used by many cycles, and they exist without any cycle |
| `LinkValidatorRegistry` – `LinkValidator` | aggregation | [Below](#shared-ports-and-infrastructure): validators are registered from outside and can be used alone |
| `StudentTodoRules` – `TodoRule` | aggregation | [Below](#dashboard): rules are registered from outside, and each can be tested alone |

A required FK alone doesn't make a composition. `Team.leaderId`, `CourseProjectCycle.createdByFacultyId` and
`FacultyAllowlistEntry.addedById` are required but they only name a person, so they are associations.

## 2.2 Per module

Each diagram runs controller → service → rules and policies → abstract port ← implementations. The `Prisma…` classes
are the ones Nest injects in production; `InMemory…` classes are test doubles in each module's `testing/` folder.

### Auth

Sign-in, sessions and faculty access, in three figures so each fits on a screen. First, the path from the controller to the rules.

```mermaid
classDiagram
  direction TB
  class AuthController {
    +google(response) void
    +googleCallback(code, state, error, request, response) void
    +devLogin(dto, request, response) void
    +refresh(request, response) AccessTokenResponseDto
    +logout(request, response) void
    +logoutAll(user, response) void
    +me(user) MeResponseDto
  }
  class AuthService {
    +beginGoogleSignIn() AuthorizationRequest
    +completeGoogleSignIn(callback, pending, userAgent) SignedIn
    +devSignIn(email, name, userAgent) SignedIn
    +refresh(presented, userAgent) RefreshedSession
    +logout(presented) void
    +logoutAll(userId) void
    +me(userId) CurrentUserProfile
  }
  class SignInService {
    +signIn(identity, provider, userAgent) SignedIn
    +recordDenial(code, context) void
  }
  class RoleResolver {
    +resolve(input) RoleResolution
    +assertCanBeElevated(identity) void
  }
  class BatchYearPolicy {
    +assertValid(batchYear) void
  }
  AuthController --> AuthService
  AuthService --> SignInService
  SignInService --> RoleResolver
  SignInService --> BatchYearPolicy
```

The identity provider, where `LoggingIdentityProvider` is a Decorator ([doc 5](05-design-patterns.md#decorator)):

```mermaid
classDiagram
  direction TB
  class AuthService
  class IdentityProvider {
    <<abstract>>
    +authorizationUrl() AuthorizationRequest
    +verifyCallback(code, pending) ExternalIdentity
  }
  class LoggingIdentityProvider {
    -IdentityProvider inner
    -FailureLog log
  }
  class GoogleIdentityProvider
  class GoogleOAuthClient {
    <<abstract>>
    +exchangeCode(code, codeVerifier) string
    +verifyIdToken(idToken) GoogleIdTokenClaims
  }
  class GoogleAuthLibraryClient
  AuthService --> IdentityProvider
  IdentityProvider <|-- LoggingIdentityProvider
  IdentityProvider <|-- GoogleIdentityProvider
  LoggingIdentityProvider o-- IdentityProvider : wraps
  GoogleIdentityProvider --> GoogleOAuthClient
  GoogleOAuthClient <|-- GoogleAuthLibraryClient
```

Sessions:

```mermaid
classDiagram
  direction TB
  class AuthService
  class SignInService
  class SessionService {
    +startFamily(userId, userAgent, tx) IssuedRefreshToken
    +rotate(presented, userAgent) RotatedSession
    +revokeFamilyOf(presented, tx) RefreshTokenRecord
    +revokeAllForUser(userId, tx) void
  }
  class RefreshTokenRepository {
    <<abstract>>
    +create(token, tx) RefreshTokenRecord
    +findByHash(tokenHash, tx) RefreshTokenRecord
    +revokeIfActive(id, at, tx) boolean
    +markReplaced(id, replacedById, tx) void
    +hasActiveToken(familyId, now, tx) boolean
    +revokeFamily(familyId, at, tx) number
    +revokeAllForUser(userId, at, tx) number
  }
  class PrismaRefreshTokenRepository
  class InMemoryRefreshTokenRepository
  AuthService --> SessionService
  SignInService --> SessionService
  SessionService --> RefreshTokenRepository
  RefreshTokenRepository <|-- PrismaRefreshTokenRepository
  RefreshTokenRepository <|-- InMemoryRefreshTokenRepository
```

The remaining auth ports:

```mermaid
classDiagram
  direction LR
  class AuthService
  class SignInService
  class FacultyAccessService {
    +listAllowlist() FacultyAllowlistEntry[]
    +listRequests(status) FacultyAccessRequestWithUser[]
    +addToAllowlist(actorId, rawEmail, name) FacultyAllowlistEntry
    +removeFromAllowlist(actorId, entryId) void
    +approveRequest(actorId, requestId) FacultyAccessRequest
    +rejectRequest(actorId, requestId) FacultyAccessRequest
  }
  class StudentPreRegistration {
    +check(rawEmail) StudentEmailCheck
    +ensureAccounts(actorId, students, tx) StudentAccounts
  }
  class DemoAccountsService {
    +list() ListedDemoAccount[]
    +seed() SeededDemoAccount[]
  }
  class TokenSigner {
    <<abstract>>
    +sign(claims) SignedAccessToken
    +verify(token) AccessTokenClaims
  }
  class JwtTokenSigner
  class DevIdentityProvider {
    <<abstract>>
    +identify(email, name) ExternalIdentity
    +assertEnabled() void
  }
  class LocalDevIdentityProvider
  class FacultyDirectory {
    <<abstract>>
    +isApproved(email, tx) boolean
    +addEntry(entry, tx) FacultyAllowlistEntry
    +createRequestIfAbsent(userId, email, tx) boolean
    +decideRequest(userId, email, decision, tx) FacultyAccessRequest
  }
  class PrismaFacultyDirectory
  class UniversityIdentityParser {
    <<abstract>>
    +parse(email) UniversityIdentity
  }
  class RishihoodIdentityParser
  AuthService --> TokenSigner
  AuthService --> DevIdentityProvider
  AuthService --> FacultyDirectory
  SignInService --> FacultyDirectory
  SignInService --> UniversityIdentityParser
  FacultyAccessService --> FacultyDirectory
  FacultyAccessService --> UniversityIdentityParser
  StudentPreRegistration --> UniversityIdentityParser
  DemoAccountsService --> DevIdentityProvider
  DemoAccountsService --> FacultyAccessService
  TokenSigner <|-- JwtTokenSigner
  DevIdentityProvider <|-- LocalDevIdentityProvider
  FacultyDirectory <|-- PrismaFacultyDirectory
  UniversityIdentityParser <|-- RishihoodIdentityParser
```

**Where in the code:** `backend/src/auth/auth.module.ts`, `backend/src/auth/presentation/auth.controller.ts`,
`backend/src/auth/application/`, `backend/src/auth/domain/`, `backend/src/auth/infrastructure/`, `backend/src/auth/testing/`

### Course cycles

The cycle aggregate's use cases, and the registries other modules plug into.

```mermaid
classDiagram
  direction LR
  class CourseCycleController {
    +create(user, dto) CycleResponseDto
    +list(user) CycleResponseDto[]
    +update(user, id, dto) CycleResponseDto
    +checkPublish(user, id) PublishChecksDto
    +publish(user, id) PublishResponseDto
    +close(user, id) CycleResponseDto
  }
  class CycleEnrollmentController
  class CycleBatchController
  class MeController
  class CourseCycleService {
    +create(actor, dto) CycleView
    +listVisible(actor) CycleView[]
    +upcomingFor(actor) StudentEvent[]
    +getVisibleCycle(actor, id) Cycle
    +update(actor, id, dto) CycleView
    +checkPublish(actor, id) PublishReport
    +publish(actor, id) PublishedCycle
    +close(actor, id) CycleView
    +getById(id) Cycle
  }
  class CycleEnrollmentService {
    +add(actor, cycleId, rawEmails) EnrollmentResult
    +importBatch(actor, cycleId, rawEmails) BatchImportResult
    +remove(actor, cycleId, rawEmail) void
    +rosterOf(cycle) CycleRoster
  }
  class CycleWorkflow
  class CycleAuthorizationPolicy {
    +assertOwner(actor, cycle) void
    +canRead(actor, cycle, enrolled, formerMember) boolean
    +assertCanManageRoster(actor, cycle) void
    +assertCanManageBatch(actor, cycle) void
  }
  class CycleTimeline
  class PublishChecks {
    +register(check) void
    +run(cycle, tx) PublishReport
  }
  class EnrollmentRemovalChecks {
    +register(check) void
    +assertCanRemove(cycleId, email, tx) void
  }
  class CycleMembership {
    +provide(lookup) void
    +cyclesOf(userId) string[]
  }
  class CycleRepository {
    <<abstract>>
    +create(data, milestones, tx) Cycle
    +findById(id, tx) Cycle
    +lockById(id, tx) Cycle
    +update(id, expectedStatus, fields, milestones, tx) Cycle
    +transitionStatus(id, expectedStatus, nextStatus, timestamp, tx) Cycle
    +addEnrollments(cycleId, emails, addedById, tx) void
  }
  class PrismaCycleRepository
  class InMemoryCycleRepository
  CourseCycleController --> CourseCycleService
  MeController --> CourseCycleService
  CycleEnrollmentController --> CycleEnrollmentService
  CycleBatchController --> CycleEnrollmentService
  CourseCycleService --> CycleWorkflow
  CourseCycleService --> CycleAuthorizationPolicy
  CourseCycleService --> CycleTimeline
  CourseCycleService --> PublishChecks
  CourseCycleService --> CycleMembership
  CourseCycleService --> CycleRepository
  CycleEnrollmentService --> CycleAuthorizationPolicy
  CycleEnrollmentService --> EnrollmentRemovalChecks
  CycleEnrollmentService --> CycleRepository
  CycleRepository <|-- PrismaCycleRepository
  CycleRepository <|-- InMemoryCycleRepository
```

**Where in the code:** `backend/src/course-cycles/course-cycles.module.ts`, `backend/src/course-cycles/presentation/`,
`backend/src/course-cycles/application/`, `backend/src/course-cycles/domain/`, `backend/src/course-cycles/infrastructure/`,
`backend/src/course-cycles/testing/`

### Teams

Formation by students, completion by faculty, and reads. `TeamCycles` and `StudentDirectory` are adapters onto other
modules.

```mermaid
classDiagram
  direction LR
  class CycleTeamsController
  class TeamsController
  class TeamCompletionController
  class TeamFormationService {
    +create(actor, cycleId, input) Team
    +update(actor, teamId, input) Team
    +disband(actor, teamId) void
    +startLooking(actor, cycleId, note) void
    +stopLooking(actor, cycleId) void
  }
  class TeamCompletionService {
    +overview(actor, cycleId) CompletionOverview
    +createTeam(actor, cycleId, proposal) Team
    +addMember(actor, teamId, userId) Team
    +previewAutoGroup(actor, cycleId) AutoGroupPreview
    +applyAutoGroup(actor, cycleId, proposals) Team[]
  }
  class TeamQueryService {
    +listForCycle(actor, cycleId) Team[]
    +findById(actor, teamId) Team
    +listMine(actor) Team[]
    +searchCandidates(actor, cycleId, query) TeamCandidate[]
    +listSeekers(actor, cycleId) TeamCandidate[]
  }
  class TeamRules
  class TeamAccessPolicy
  class TeamAllocator
  class TeamRepository {
    <<abstract>>
    +findById(id) Team
    +findByIdForUpdate(id, tx) Team
    +findMemberships(cycleId, userIds, tx) Membership[]
    +create(team, tx) Team
    +update(id, change, tx) Team
    +delete(id, tx) void
  }
  class TeamSeekerRepository {
    <<abstract>>
    +save(cycleId, userId, note) void
    +removeMany(cycleId, userIds, tx) void
    +list(cycleId) TeamSeeker[]
  }
  class TeamCycles {
    <<abstract>>
    +getVisible(actor, cycleId) TeamCycle
    +getById(cycleId) TeamCycle
    +rosterOf(cycle) CycleRoster
    +notSignedIn(cycle) string[]
  }
  class StudentDirectory {
    <<abstract>>
    +findByIds(ids, tx) DirectoryUser[]
    +search(roster, query, limit) DirectoryUser[]
    +listParticipants(roster) DirectoryUser[]
  }
  class PrismaTeamRepository
  class InMemoryTeamRepository
  class PrismaTeamSeekerRepository
  class InMemoryTeamSeekerRepository
  class CourseCycleTeamCycles
  class UsersStudentDirectory
  class InMemoryStudentDirectory
  CycleTeamsController --> TeamFormationService
  CycleTeamsController --> TeamQueryService
  TeamsController --> TeamFormationService
  TeamsController --> TeamQueryService
  TeamsController --> TeamCompletionService
  TeamCompletionController --> TeamCompletionService
  TeamFormationService --> TeamRules
  TeamFormationService --> TeamAccessPolicy
  TeamCompletionService *-- TeamAllocator
  TeamFormationService --> TeamRepository
  TeamFormationService --> TeamCycles
  TeamFormationService --> StudentDirectory
  TeamFormationService --> TeamSeekerRepository
  TeamRepository <|-- PrismaTeamRepository
  TeamRepository <|-- InMemoryTeamRepository
  TeamSeekerRepository <|-- PrismaTeamSeekerRepository
  TeamSeekerRepository <|-- InMemoryTeamSeekerRepository
  TeamCycles <|-- CourseCycleTeamCycles
  StudentDirectory <|-- UsersStudentDirectory
  StudentDirectory <|-- InMemoryStudentDirectory
```

`TeamCompletionService` and `TeamQueryService` use the same four ports and the same rules as `TeamFormationService`;
those arrows are left out so the diagram stays readable.

**Where in the code:** `backend/src/teams/teams.module.ts`, `backend/src/teams/presentation/`, `backend/src/teams/application/`,
`backend/src/teams/domain/`, `backend/src/teams/infrastructure/`, `backend/src/teams/testing/`

### Ideas

```mermaid
classDiagram
  direction LR
  class IdeasController
  class CycleIdeasController
  class IdeaCatalogController
  class IdeaService {
    +get(actor, teamId) Idea
    +getTeamIdeaSummary(actor, teamId) object
    +submit(actor, teamId, content) Idea
    +pick(actor, teamId, catalogIdeaId) Idea
    +review(actor, teamId, input) Idea
    +listForOwnTeams(teamIds) Idea[]
    +listForCycle(actor, cycleId) CycleIdea[]
  }
  class IdeaCatalogService {
    +list(actor, cycleId) CatalogIdea[]
    +add(actor, cycleId, content) CatalogIdea
    +update(actor, cycleId, id, content) CatalogIdea
    +remove(actor, cycleId, id) void
  }
  class IdeaPublishCheck {
    +onModuleInit() void
  }
  class IdeaRules
  class IdeaRepository {
    <<abstract>>
    +findByTeam(teamId, tx) Idea
    +findSummaryByTeam(teamId) IdeaSummary
    +lockTeamIdea(teamId, tx) object
    +create(idea, tx) Idea
    +revise(id, revision, tx) Idea
    +review(id, review, tx) Idea
  }
  class IdeaCatalogRepository {
    <<abstract>>
    +list(cycleId) CatalogIdea[]
    +lock(id, cycleId, tx) CatalogIdea
    +create(idea, tx) CatalogIdea
    +update(id, content, tx) CatalogIdea
    +remove(id, tx) void
  }
  class IdeaTeams {
    <<abstract>>
    +getVisible(actor, teamId) object
    +getVisibleCycle(actor, cycleId) IdeaCycle
    +listForCycle(actor, cycleId) object
  }
  class PrismaIdeaRepository
  class InMemoryIdeaRepository
  class PrismaIdeaCatalogRepository
  class InMemoryIdeaCatalogRepository
  class TeamsIdeaTeams
  IdeasController --> IdeaService
  CycleIdeasController --> IdeaService
  IdeaCatalogController --> IdeaCatalogService
  IdeaService --> IdeaRules
  IdeaCatalogService --> IdeaRules
  IdeaService --> IdeaRepository
  IdeaService --> IdeaCatalogRepository
  IdeaService --> IdeaTeams
  IdeaCatalogService --> IdeaCatalogRepository
  IdeaCatalogService --> IdeaTeams
  IdeaPublishCheck --> IdeaCatalogRepository
  IdeaRepository <|-- PrismaIdeaRepository
  IdeaRepository <|-- InMemoryIdeaRepository
  IdeaCatalogRepository <|-- PrismaIdeaCatalogRepository
  IdeaCatalogRepository <|-- InMemoryIdeaCatalogRepository
  IdeaTeams <|-- TeamsIdeaTeams
```

**Where in the code:** `backend/src/ideas/ideas.module.ts`, `backend/src/ideas/presentation/`, `backend/src/ideas/application/`,
`backend/src/ideas/domain/`, `backend/src/ideas/infrastructure/`, `backend/src/ideas/testing/`

### Submissions

```mermaid
classDiagram
  direction LR
  class SubmissionsController
  class CycleSubmissionsController
  class SubmissionService {
    +list(actor, teamId, milestoneId, page) Submission[]
    +submit(actor, teamId, milestoneId, content) Submission
    +submittedMilestones(teamIds) object[]
    +listForCycle(actor, cycleId, milestoneId) CycleSubmission[]
    +latestForCycle(actor, cycleId, milestoneId) LatestSubmission[]
  }
  class SubmissionRules
  class RateLimiter {
    <<abstract>>
    +consume(key, limit, windowMs, tx) RateLimitDecision
  }
  class SubmissionRepository {
    <<abstract>>
    +listByTeam(teamId, milestoneId, page) Submission[]
    +listSubmittedMilestones(teamIds) object[]
    +listLatestByMilestone(milestoneId) Submission[]
    +lockLatestVersion(teamId, milestoneId, tx) number
    +create(submission, tx) Submission
  }
  class SubmissionTeams {
    <<abstract>>
    +getVisible(actor, teamId) object
    +getVisibleTeam(actor, teamId) object
    +getVisibleCycle(actor, cycleId) SubmissionCycle
    +listForCycle(actor, cycleId) object
  }
  class PrismaSubmissionRepository
  class InMemorySubmissionRepository
  class IdeasSubmissionTeams
  SubmissionsController --> SubmissionService
  CycleSubmissionsController --> SubmissionService
  SubmissionService --> SubmissionRules
  SubmissionService --> RateLimiter
  SubmissionService --> SubmissionRepository
  SubmissionService --> SubmissionTeams
  SubmissionRepository <|-- PrismaSubmissionRepository
  SubmissionRepository <|-- InMemorySubmissionRepository
  SubmissionTeams <|-- IdeasSubmissionTeams
```

**Where in the code:** `backend/src/submissions/submissions.module.ts`, `backend/src/submissions/presentation/`,
`backend/src/submissions/application/`, `backend/src/submissions/domain/`, `backend/src/submissions/infrastructure/`,
`backend/src/submissions/testing/`

### Evaluations

There's no in-memory evaluation repository: the rules are unit-tested directly, and the repository against the real
database (`backend/test/evaluations.e2e.ts`).

```mermaid
classDiagram
  direction TB
  class EvaluationsController {
    +grading(user, cycleId, milestoneId) GradingDto
    +setMaxMarks(user, cycleId, milestoneId, dto) GradingDto
    +release(user, cycleId, milestoneId) GradingDto
    +save(user, cycleId, milestoneId, teamId, dto) TeamEvaluationDto
    +teamEvaluations(user, cycleId, milestoneId, teamId) TeamEvaluationDto[]
  }
  class EvaluationService {
    +gradingView(actor, cycleId, milestoneId) GradingView
    +setMaxMarks(actor, cycleId, milestoneId, maxMarks) GradingView
    +saveEvaluation(actor, cycleId, milestoneId, teamId, command) TeamEvaluationView
    +release(actor, cycleId, milestoneId) GradingView
    +teamEvaluations(actor, cycleId, milestoneId, teamId) TeamEvaluationView[]
    +releasedForMember(userId, teamIds) MemberEvaluationView[]
  }
  class EvaluationRules
  class EvaluationPolicy
  class EvaluationRepository {
    <<abstract>>
    +findGrading(milestoneId, tx) MilestoneGrading
    +lockGrading(milestoneId, tx) MilestoneGrading
    +shareGrading(milestoneId, tx) MilestoneGrading
    +release(milestoneId, releasedById, at, tx) MilestoneGrading
    +save(save, tx) Evaluation
    +listReleasedForMember(userId, teamIds) ReleasedEvaluation[]
  }
  class GradingSources {
    <<abstract>>
    +visibleCycle(actor, cycleId) GradingCycle
    +teamsOf(actor, cycleId) GradingTeam[]
    +team(actor, teamId) GradingTeam
    +latestWork(actor, cycleId, milestoneId) LatestWork[]
  }
  class PrismaEvaluationRepository
  class ModulesGradingSources
  EvaluationsController --> EvaluationService
  EvaluationService --> EvaluationRules
  EvaluationService --> EvaluationPolicy
  EvaluationService --> EvaluationRepository
  EvaluationService --> GradingSources
  EvaluationRepository <|-- PrismaEvaluationRepository
  GradingSources <|-- ModulesGradingSources
```

**Where in the code:** `backend/src/evaluations/evaluations.module.ts`, `backend/src/evaluations/presentation/`,
`backend/src/evaluations/application/`, `backend/src/evaluations/domain/`, `backend/src/evaluations/infrastructure/`

### Dashboard

A read model with no tables of its own. It reads only through other modules' services.

```mermaid
classDiagram
  direction LR
  class DashboardController {
    +forMe(user) StudentDashboardDto
  }
  class DashboardService {
    +forStudent(actor) StudentDashboard
  }
  class StudentTodoRules {
    +register(rule) StudentTodoRules
    +itemsFor(context) TodoItem[]
    +withDefaults()$ StudentTodoRules
  }
  class TodoRule {
    <<interface>>
    +string name
    +items(context) TodoItem[]
  }
  class NoTeamWhileForming
  class IdeaDue
  class RejectedIdea
  class OpenMilestoneWithoutWork
  class StudentSources {
    <<abstract>>
    +activeCycles(actor) CycleView[]
    +pastCycles(actor) CycleView[]
    +upcomingEvents(actor) StudentEvent[]
    +myTeams(actor) DashboardTeam[]
    +ideasOf(teamIds) DashboardIdea[]
    +submittedMilestones(teamIds) object[]
    +releasedResults(userId, teamIds) MemberEvaluationView[]
  }
  class ModulesStudentSources
  DashboardController --> DashboardService
  DashboardService *-- StudentTodoRules
  DashboardService --> StudentSources
  StudentTodoRules o-- TodoRule
  TodoRule <|.. NoTeamWhileForming
  TodoRule <|.. IdeaDue
  TodoRule <|.. RejectedIdea
  TodoRule <|.. OpenMilestoneWithoutWork
  StudentSources <|-- ModulesStudentSources
```

**Where in the code:** `backend/src/dashboard/dashboard.module.ts`, `backend/src/dashboard/presentation/dashboard.controller.ts`,
`backend/src/dashboard/application/`, `backend/src/dashboard/domain/`, `backend/src/dashboard/infrastructure/modules-student-sources.ts`

### Admin

The one flat module: `admin/` has no `application/` or `domain/` folders. It's a small controller and service over
`UsersService`, `SessionService` and `FacultyAccessService`, so it owns no ports. It still depends only inward.

```mermaid
classDiagram
  direction LR
  class AdminController {
    +listAllowlist() AllowlistEntryDto[]
    +addToAllowlist(actor, dto) AllowlistEntryDto
    +removeFromAllowlist(actor, id) void
    +listRequests(query) FacultyRequestDto[]
    +approveRequest(actor, id) FacultyRequestDto
    +rejectRequest(actor, id) FacultyRequestDto
    +listUsers(query) UserPageDto
    +correctBatch(actor, id, dto) AdminUserDto
    +deactivate(actor, id) AdminUserDto
    +reactivate(actor, id) AdminUserDto
  }
  class AdminService {
    +listUsers(query) UserPage
    +correctBatch(actorId, userId, batchYear) User
    +deactivate(actorId, userId) User
    +reactivate(actorId, userId) User
  }
  class FacultyAccessService
  class UsersService
  class SessionService
  class BatchYearPolicy
  class AuditService
  class TransactionRunner {
    <<abstract>>
    +run(work) T
  }
  AdminController --> AdminService
  AdminController --> FacultyAccessService
  AdminService --> UsersService
  AdminService --> SessionService
  AdminService --> BatchYearPolicy
  AdminService --> AuditService
  AdminService --> TransactionRunner
```

**Where in the code:** `backend/src/admin/admin.controller.ts`, `backend/src/admin/admin.service.ts`, `backend/src/admin/admin.module.ts`

### Shared ports and infrastructure

The ports every module uses: time, randomness, transactions, rate limits, users, audit and the health probe.

```mermaid
classDiagram
  direction LR
  class Clock {
    <<abstract>>
    +now() Date
  }
  class SystemClock
  class FixedClock
  class RandomSource {
    <<abstract>>
    +int(maxExclusive) number
  }
  class CryptoRandomSource
  class SeededRandom
  class TransactionRunner {
    <<abstract>>
    +run(work) T
  }
  class PrismaTransactionRunner
  class ImmediateTransactionRunner
  class RateLimiter {
    <<abstract>>
    +consume(key, limit, windowMs, tx) RateLimitDecision
  }
  class PostgresRateLimiter {
    +increment(key, ttl, limit, blockDuration, throttlerName) ThrottlerStorageRecord
    +sweep() number
  }
  class InMemoryRateLimiter
  class ThrottlerStorage {
    <<interface>>
    +increment(key, ttl, limit, blockDuration, throttlerName) ThrottlerStorageRecord
  }
  class UsersRepository {
    <<abstract>>
    +findById(id, tx) User
    +findByGoogleSub(googleSub, tx) User
    +create(user, tx) User
    +updateAccess(id, change, tx) User
    +claim(id, googleSub, tx) User
  }
  class PrismaUsersRepository
  class AuditRepository {
    <<abstract>>
    +append(event, tx) void
  }
  class PrismaAuditRepository
  class DatabaseProbe {
    <<abstract>>
    +ping() void
  }
  class PrismaDatabaseProbe
  Clock <|-- SystemClock
  Clock <|-- FixedClock
  RandomSource <|-- CryptoRandomSource
  RandomSource <|-- SeededRandom
  TransactionRunner <|-- PrismaTransactionRunner
  TransactionRunner <|-- ImmediateTransactionRunner
  RateLimiter <|-- PostgresRateLimiter
  RateLimiter <|-- InMemoryRateLimiter
  ThrottlerStorage <|.. PostgresRateLimiter
  UsersRepository <|-- PrismaUsersRepository
  AuditRepository <|-- PrismaAuditRepository
  DatabaseProbe <|-- PrismaDatabaseProbe
```

**Where in the code:** `backend/src/common/clock.ts`, `backend/src/common/random.ts`, `backend/src/common/transaction.ts`,
`backend/src/common/rate-limit.ts`, `backend/src/common/testing/`, `backend/src/prisma/`, `backend/src/users/domain/users.repository.ts`,
`backend/src/users/infrastructure/prisma-users.repository.ts`, `backend/src/audit/domain/audit.repository.ts`,
`backend/src/audit/infrastructure/prisma-audit.repository.ts`, `backend/src/health/application/ports/database-probe.ts`,
`backend/src/health/infrastructure/prisma-database-probe.ts`

### Links: Strategy and registry

Each link type's validation is a strategy, found through a registry.

```mermaid
classDiagram
  direction LR
  class LinkRequirement {
    +check(links, validators) Link[]
  }
  class LinkValidatorRegistry {
    +register(validator) LinkValidatorRegistry
    +for(type) LinkValidator
    +withDefaults()$ LinkValidatorRegistry
  }
  class LinkValidator {
    <<interface>>
    +LinkType type
    +string expected
    +accepts(url) boolean
  }
  class GithubLinkValidator
  class DriveLinkValidator
  class HttpsLinkValidator
  LinkRequirement --> LinkValidatorRegistry
  LinkValidatorRegistry o-- LinkValidator
  LinkValidator <|.. GithubLinkValidator
  LinkValidator <|.. DriveLinkValidator
  LinkValidator <|.. HttpsLinkValidator
```

**Where in the code:** `backend/src/common/links/link-validators.ts`, `backend/src/common/links/link-requirement.ts`

## 2.3 The `DomainError` hierarchy and the single filter

Every expected failure is a `DomainError` with a code. One global filter turns any error into the same response body.

```mermaid
classDiagram
  direction TB
  class Error
  class DomainError~Code~ {
    +Code code
    +string message
    +ErrorDetail[] details
  }
  class AuthDomainError
  class CycleDomainError
  class TeamDomainError
  class IdeaDomainError
  class SubmissionDomainError
  class EvaluationDomainError
  class AdminDomainError
  class LinkDomainError
  class RateLimitedError
  class ExceptionFilter {
    <<interface>>
    +catch(exception, host) void
  }
  class ApiExceptionFilter {
    +catch(exception, host) void
    -toResponse(exception) ApiErrorBody
    -messageOf(exception) string
  }
  Error <|-- DomainError
  DomainError <|-- AuthDomainError
  DomainError <|-- CycleDomainError
  DomainError <|-- TeamDomainError
  DomainError <|-- IdeaDomainError
  DomainError <|-- SubmissionDomainError
  DomainError <|-- EvaluationDomainError
  DomainError <|-- AdminDomainError
  DomainError <|-- LinkDomainError
  DomainError <|-- RateLimitedError
  ExceptionFilter <|.. ApiExceptionFilter
  ApiExceptionFilter --> DomainError : catches all, by base class
```

The filter's `instanceof DomainError` branch is the only one for all nine subclasses. `OriginGuard` and
`BodyDepthMiddleware` throw `DomainError` itself with a `CommonErrorCode`. The code decides the HTTP status through
`statusForCode`, and `satisfies Record<DomainErrorCode, HttpStatus>` makes the build fail if a code has no status.

**Where in the code:** `backend/src/common/errors/domain-error.ts`, `backend/src/common/errors/api-exception.filter.ts`,
`backend/src/common/errors/error-status.ts`, `backend/src/common/rate-limit.ts`,
each `*.errors.ts`: `backend/src/auth/domain/auth.errors.ts`, `backend/src/course-cycles/domain/cycle.errors.ts`,
`backend/src/teams/domain/team.errors.ts`, `backend/src/ideas/domain/idea.errors.ts`,
`backend/src/submissions/domain/submission.errors.ts`, `backend/src/evaluations/domain/evaluation.errors.ts`,
`backend/src/admin/admin.errors.ts`, `backend/src/common/links/link.errors.ts`

## 2.4 Test builders

Test data builders live in the testing kits. [Doc 5](05-design-patterns.md#builder) explains why they're for tests only.

```mermaid
classDiagram
  direction LR
  class CycleBuilder {
    +inStatus(status) CycleBuilder
    +published() CycleBuilder
    +closed() CycleBuilder
    +ofKind(kind) CycleBuilder
    +elective() CycleBuilder
    +ownedBy(facultyId) CycleBuilder
    +forBatch(batchYear) CycleBuilder
    +withMilestones(count) CycleBuilder
    +startingAt(start) CycleBuilder
    +build() Cycle
    +buildCreateData() CycleCreateData
    +buildMilestones() PlacedMilestone[]
  }
  class TeamBuilder {
    +inCycle(cycleId) TeamBuilder
    +ledBy(userId) TeamBuilder
    +formedBy(origin) TeamBuilder
    +withMembers(count) TeamBuilder
    +withMemberIds(userIds) TeamBuilder
    +build() Team
  }
  class SubmissionBuilder {
    +forTeam(teamId) SubmissionBuilder
    +inCycle(cycleId) SubmissionBuilder
    +forMilestone(milestoneId) SubmissionBuilder
    +version(version) SubmissionBuilder
    +by(person) SubmissionBuilder
    +at(submittedAt) SubmissionBuilder
    +build() Submission
    +buildNew() NewSubmission
  }
  CycleBuilder --> Cycle : builds
  TeamBuilder --> Team : builds
  SubmissionBuilder --> Submission : builds
```

**Where in the code:** `backend/src/course-cycles/testing/cycle.builder.ts`, `backend/src/teams/testing/team.builder.ts`,
`backend/src/submissions/testing/submission.builder.ts`

## 2.5 Checking the diagrams against the code

`docs/design/scripts/list-ports.ts` reads the TypeScript AST of `backend/src`, and lists every abstract class and every
class that extends it in [generated/ports.md](generated/ports.md). With `--check`, it also fails if this document leaves
out a port or a production implementation.

```bash
cd backend && npm run docs:ports -- --check
```

**Recorded run:** on the `lld-complete` branch, commit `18163ae`, and again after the 503 fix that follows it. The
result is in [doc 10](10-implementation.md#104-confirmations).
