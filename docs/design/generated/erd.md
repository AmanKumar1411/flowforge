# Entity-relationship diagrams

Generated from `backend/prisma/schema.prisma` by `npm run docs:erd`. Do not edit by hand.

19 tables, 12 enums, 54 primary keys, unique keys and indexes declared in the schema.

## All tables and how they connect

Every table and foreign key except those pointing at `User`, so the diagram stays readable. The area diagrams below show the `User` links. Each label is the relation's field name and its `onDelete` rule.

```mermaid
erDiagram
  RefreshToken |o--o| RefreshToken : "replacedBy, Restrict"
  CourseProjectCycle ||--o{ Milestone : "cycle, Restrict"
  CourseProjectCycle ||--o{ CycleEnrollment : "cycle, Restrict"
  CourseProjectCycle ||--o{ Team : "cycle, Restrict"
  Team ||--o{ TeamMember : "team, Cascade"
  CourseProjectCycle ||--o{ TeamSeeker : "cycle, Restrict"
  CourseProjectCycle ||--o{ CatalogIdea : "cycle, Restrict"
  Team ||--o| ProjectIdea : "team, Cascade"
  CatalogIdea |o--o{ ProjectIdea : "catalogIdea, Restrict"
  ProjectIdea ||--o{ IdeaReview : "idea, Cascade"
  Team ||--o{ Submission : "team, Restrict"
  Milestone ||--o{ Submission : "milestone, Restrict"
  Milestone ||--o| MilestoneGrading : "milestone, Restrict"
  Milestone ||--o{ Evaluation : "milestone, Restrict"
  Team ||--o{ Evaluation : "team, Restrict"
  Evaluation ||--o{ EvaluationRevision : "evaluation, Restrict"
  User ||--o{ CourseProjectCycle : "owns (one of many person links)"
  FacultyAllowlistEntry
  FacultyAccessRequest
  AuditLog
  RateLimitCounter
```

**Where in the code:** `backend/prisma/schema.prisma`

## Identity and access

Who can sign in, with which role, and every session and audit row. A box without columns belongs to another area.

```mermaid
erDiagram
  User {
    String id PK
    String googleSub UK "nullable"
    String email UK
    String name
    String avatarUrl "nullable"
    UserRole role
    UserStatus status
    Int batchYear "nullable"
    Int tokenVersion
    DateTime lastLoginAt "nullable"
    DateTime createdAt
    DateTime updatedAt
  }
  FacultyAllowlistEntry {
    String id PK
    String email UK
    String name "nullable"
    FacultyAllowlistSource source
    String addedById FK
    DateTime createdAt
  }
  FacultyAccessRequest {
    String id PK
    String userId FK,UK
    String email
    FacultyAccessRequestStatus status
    String decidedById FK "nullable"
    DateTime decidedAt "nullable"
    DateTime createdAt
  }
  RefreshToken {
    String id PK
    String userId FK
    String familyId
    String tokenHash UK
    DateTime expiresAt
    DateTime familyExpiresAt
    DateTime revokedAt "nullable"
    String replacedById FK,UK "nullable"
    String userAgent "nullable"
    DateTime createdAt
  }
  AuditLog {
    String id PK
    String actorId FK "nullable"
    AuditAction action
    String entityType
    String entityId
    Json metadata
    DateTime createdAt
  }
  User ||--o{ FacultyAllowlistEntry : "addedBy, Restrict"
  User ||--o| FacultyAccessRequest : "user, Restrict"
  User |o--o{ FacultyAccessRequest : "decidedBy, Restrict"
  User ||--o{ RefreshToken : "user, Restrict"
  RefreshToken |o--o| RefreshToken : "replacedBy, Restrict"
  User |o--o{ AuditLog : "actor, Restrict"
```

**Where in the code:** `backend/prisma/schema.prisma`

## Cycles

A project cycle, its milestones and its roster. A box without columns belongs to another area.

```mermaid
erDiagram
  CourseProjectCycle {
    String id PK
    String courseName
    String title
    String description "nullable"
    Int batchYear
    Int semester
    String academicYear
    Int minTeamSize
    Int maxTeamSize
    DateTime teamDeadline
    DateTime ideaDeadline
    CycleIdeaSource ideaSource
    Json ideaLinkRequirement
    CourseKind kind
    CycleStatus status
    String createdByFacultyId FK
    DateTime publishedAt "nullable"
    DateTime closedAt "nullable"
    DateTime createdAt
    DateTime updatedAt
  }
  Milestone {
    String id PK
    String cycleId FK
    Int position
    String name
    String description "nullable"
    DateTime submissionOpensAt
    DateTime submissionDueAt
    DateTime evaluationAt
    Json linkRequirement
    DateTime createdAt
    DateTime updatedAt
  }
  CycleEnrollment {
    String cycleId PK,FK
    String email PK
    String addedById FK
    DateTime createdAt
  }
  User ||--o{ CourseProjectCycle : "createdByFaculty, Restrict"
  CourseProjectCycle ||--o{ Milestone : "cycle, Restrict"
  CourseProjectCycle ||--o{ CycleEnrollment : "cycle, Restrict"
  User ||--o{ CycleEnrollment : "addedBy, Restrict"
```

**Where in the code:** `backend/prisma/schema.prisma`

## Teams

The teams formed in a cycle, their members, and students looking for one. A box without columns belongs to another area.

```mermaid
erDiagram
  Team {
    String id PK
    String cycleId FK
    String name
    String leaderId FK
    TeamOrigin origin
    DateTime createdAt
    DateTime updatedAt
  }
  TeamMember {
    String teamId PK,FK
    String cycleId FK
    String userId PK,FK
    String addedById FK
    DateTime addedAt
  }
  TeamSeeker {
    String cycleId PK,FK
    String userId PK,FK
    String note "nullable"
    DateTime createdAt
  }
  CourseProjectCycle ||--o{ Team : "cycle, Restrict"
  User ||--o{ Team : "leader, Restrict"
  Team ||--o{ TeamMember : "team, Cascade"
  User ||--o{ TeamMember : "user, Restrict"
  User ||--o{ TeamMember : "addedBy, Restrict"
  CourseProjectCycle ||--o{ TeamSeeker : "cycle, Restrict"
  User ||--o{ TeamSeeker : "user, Restrict"
```

**Where in the code:** `backend/prisma/schema.prisma`

## Ideas

The faculty's catalog, each team's one current idea, and every review of it. A box without columns belongs to another area.

```mermaid
erDiagram
  CatalogIdea {
    String id PK
    String cycleId FK
    String title
    String description
    String link "nullable"
    String createdById FK
    DateTime createdAt
    DateTime updatedAt
  }
  ProjectIdea {
    String id PK
    String teamId FK
    String cycleId FK
    String title
    String problem
    String solution "nullable"
    Json links
    IdeaStatus status
    IdeaSource source
    String catalogIdeaId FK "nullable"
    Int version
    String submittedById FK
    DateTime submittedAt
    DateTime createdAt
    DateTime updatedAt
  }
  IdeaReview {
    String id PK
    String ideaId FK
    Int version
    IdeaDecision decision
    String feedback "nullable"
    String reviewerId FK
    DateTime createdAt
  }
  CourseProjectCycle ||--o{ CatalogIdea : "cycle, Restrict"
  User ||--o{ CatalogIdea : "createdBy, Restrict"
  Team ||--o| ProjectIdea : "team, Cascade"
  CatalogIdea |o--o{ ProjectIdea : "catalogIdea, Restrict"
  User ||--o{ ProjectIdea : "submittedBy, Restrict"
  ProjectIdea ||--o{ IdeaReview : "idea, Cascade"
  User ||--o{ IdeaReview : "reviewer, Restrict"
```

**Where in the code:** `backend/prisma/schema.prisma`

## Work and evaluations

Versioned submissions per milestone, private evaluations and their history. A box without columns belongs to another area.

```mermaid
erDiagram
  Submission {
    String id PK
    String teamId FK
    String cycleId FK
    String milestoneId FK
    Int version
    Json links
    String notes "nullable"
    String submittedById FK
    DateTime submittedAt
  }
  MilestoneGrading {
    String milestoneId PK,FK
    Int maxMarks "nullable"
    DateTime releasedAt "nullable"
    String releasedById FK "nullable"
    DateTime updatedAt
  }
  Evaluation {
    String id PK
    String milestoneId FK
    String teamId FK
    String cycleId FK
    Decimal_6_2 marks "nullable"
    String feedback "nullable"
    Int version
    String evaluatedById FK
    DateTime createdAt
    DateTime updatedAt
  }
  EvaluationRevision {
    String id PK
    String evaluationId FK
    Int version
    Decimal_6_2 marks "nullable"
    String feedback "nullable"
    String evaluatedById FK
    DateTime createdAt
  }
  Team ||--o{ Submission : "team, Restrict"
  Milestone ||--o{ Submission : "milestone, Restrict"
  User ||--o{ Submission : "submittedBy, Restrict"
  Milestone ||--o| MilestoneGrading : "milestone, Restrict"
  User |o--o{ MilestoneGrading : "releasedBy, Restrict"
  Milestone ||--o{ Evaluation : "milestone, Restrict"
  Team ||--o{ Evaluation : "team, Restrict"
  User ||--o{ Evaluation : "evaluatedBy, Restrict"
  Evaluation ||--o{ EvaluationRevision : "evaluation, Restrict"
  User ||--o{ EvaluationRevision : "evaluatedBy, Restrict"
```

**Where in the code:** `backend/prisma/schema.prisma`

## Operations

Rate-limit counters shared by every API process. No foreign keys; the table is UNLOGGED. A box without columns belongs to another area.

```mermaid
erDiagram
  RateLimitCounter {
    String key PK
    BigInt windowStart
    Int count
    BigInt expiresAt
  }
```

**Where in the code:** `backend/prisma/schema.prisma`

## Keys and indexes declared in the schema

CHECK constraints and triggers are written by hand in the migrations; see [08-database.md](../08-database.md).

| Table | Kind | Columns |
| --- | --- | --- |
| User | primary key | id |
| User | unique | googleSub |
| User | unique | email |
| User | index | role |
| User | index | batchYear |
| User | index | status |
| FacultyAllowlistEntry | primary key | id |
| FacultyAllowlistEntry | unique | email |
| FacultyAccessRequest | primary key | id |
| FacultyAccessRequest | unique | userId |
| FacultyAccessRequest | index | status |
| RefreshToken | primary key | id |
| RefreshToken | unique | tokenHash |
| RefreshToken | unique | replacedById |
| RefreshToken | index | userId |
| RefreshToken | index | familyId |
| AuditLog | primary key | id |
| AuditLog | index | entityType, entityId, createdAt |
| CourseProjectCycle | primary key | id |
| CourseProjectCycle | index | createdByFacultyId, createdAt |
| CourseProjectCycle | index | batchYear, status, publishedAt |
| Milestone | primary key | id |
| Milestone | unique | cycleId, position |
| Milestone | unique | id, cycleId |
| CycleEnrollment | primary key | cycleId, email |
| CycleEnrollment | index | email |
| Team | primary key | id |
| Team | index | cycleId, createdAt |
| Team | unique | id, cycleId |
| Team | unique | cycleId, leaderId |
| TeamMember | primary key | teamId, userId |
| TeamMember | index | userId |
| TeamMember | unique | cycleId, userId |
| TeamSeeker | primary key | cycleId, userId |
| CatalogIdea | primary key | id |
| CatalogIdea | index | cycleId, createdAt |
| CatalogIdea | unique | id, cycleId |
| ProjectIdea | primary key | id |
| ProjectIdea | index | cycleId, status |
| ProjectIdea | index | catalogIdeaId |
| ProjectIdea | unique | teamId, cycleId |
| IdeaReview | primary key | id |
| IdeaReview | unique | ideaId, version |
| Submission | primary key | id |
| Submission | index | cycleId, milestoneId, submittedAt |
| Submission | unique | teamId, milestoneId, version |
| MilestoneGrading | primary key | milestoneId |
| Evaluation | primary key | id |
| Evaluation | index | teamId |
| Evaluation | unique | milestoneId, teamId |
| EvaluationRevision | primary key | id |
| EvaluationRevision | unique | evaluationId, version |
| RateLimitCounter | primary key | key |
| RateLimitCounter | index | expiresAt |

## Enums

| Enum | Values |
| --- | --- |
| UserRole | STUDENT, FACULTY, ADMIN, PENDING_STAFF |
| UserStatus | ACTIVE, DEACTIVATED |
| FacultyAllowlistSource | MANUAL, APPROVED_REQUEST, CSV_IMPORT |
| FacultyAccessRequestStatus | PENDING, APPROVED, REJECTED |
| AuditAction | LOGIN_SUCCEEDED, LOGIN_DENIED, USER_CREATED, ROLE_ASSIGNED, FACULTY_REQUEST_CREATED, FACULTY_REQUEST_APPROVED, FACULTY_REQUEST_REJECTED, FACULTY_ALLOWLIST_ADDED, FACULTY_ALLOWLIST_REMOVED, ELEVATION_DENIED, USER_BATCH_CORRECTED, USER_DEACTIVATED, USER_REACTIVATED, LOGOUT, LOGOUT_ALL, REFRESH_TOKEN_REUSE_DETECTED, TEAM_CREATED, TEAM_UPDATED, TEAM_DISBANDED, ENROLLMENT_ADDED, ENROLLMENT_REMOVED, AUTO_GROUP_APPLIED, USER_CLAIMED, IDEA_SUBMITTED, IDEA_UPDATED, IDEA_APPROVED, IDEA_REJECTED, CATALOG_IDEA_ADDED, CATALOG_IDEA_UPDATED, CATALOG_IDEA_REMOVED, IDEA_PICKED, SUBMISSION_CREATED, CYCLE_CREATED, CYCLE_UPDATED, CYCLE_PUBLISHED, CYCLE_CLOSED, EVALUATION_SAVED, EVALUATION_RELEASED, GRADING_SCALE_SET |
| CycleStatus | DRAFT, PUBLISHED, CLOSED |
| CourseKind | CORE, ELECTIVE |
| CycleIdeaSource | STUDENT_PROPOSALS, FACULTY_LIST, BOTH |
| TeamOrigin | STUDENT, FACULTY, AUTO_GROUP |
| IdeaStatus | SUBMITTED, APPROVED, REJECTED |
| IdeaDecision | APPROVED, REJECTED |
| IdeaSource | PROPOSAL, CATALOG |
