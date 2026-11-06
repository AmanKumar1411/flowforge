# 6 · Sequence, activity and state diagrams

Participants are real classes. Every request first passes the pipeline in
[doc 5](05-design-patterns.md#chain-of-responsibility): `BodyDepthMiddleware`, `RequestScopeMiddleware`, the global guards
(`JwtAuthGuard`, `RolesGuard`, `WriteRateLimitGuard`) and `ValidationPipe`. The diagrams leave these out unless they
matter. `tx` means one database transaction through `TransactionRunner`.

## 6.1 Sequence diagrams

### 1a. Google sign-in: the redirect

PKCE, `state` and `nonce` are created here, and they tie Google's answer to this browser and this login.

```mermaid
%%{init: {"sequence": {"wrap": true, "width": 170}}}%%
sequenceDiagram
  actor B as Browser
  participant C as AuthController
  participant K as AuthCookies
  participant A as AuthService
  participant L as LoggingIdentityProvider
  participant P as GoogleIdentityProvider
  participant G as Google

  B->>C: GET /api/auth/google
  C->>A: beginGoogleSignIn()
  A->>L: authorizationUrl()
  L->>P: authorizationUrl()
  P-->>C: url with code_challenge, state, nonce, plus pending secrets
  C->>K: setPendingAuthorization(pending)
  Note right of K: signed, httpOnly, SameSite=Lax, 10 minutes
  C-->>B: 302 to accounts.google.com
  B->>G: choose an account
  G-->>B: 302 with code and state
```

**Where in the code:** `backend/src/auth/presentation/auth.controller.ts`, `backend/src/auth/application/auth.service.ts`,
`backend/src/auth/infrastructure/logging-identity.provider.ts`, `backend/src/auth/infrastructure/google-identity.provider.ts`,
`backend/src/auth/presentation/auth-cookies.ts`

### 1b. Google sign-in: verifying Google's answer

The callback checks `state`, exchanges the code and verifies the ID token. On failure, the decorator logs why, and the browser is told only the code.

```mermaid
%%{init: {"sequence": {"wrap": true, "width": 170}}}%%
sequenceDiagram
  actor B as Browser
  participant C as AuthController
  participant A as AuthService
  participant L as LoggingIdentityProvider
  participant P as GoogleIdentityProvider
  participant G as Google
  participant S as SignInService

  B->>C: GET /api/auth/google/callback?code&state
  C->>C: readPendingAuthorization, then clear it
  C->>A: completeGoogleSignIn(callback, pending, userAgent)
  A->>A: error from Google? SIGN_IN_CANCELLED
  A->>A: state equals pending.state (timing safe)? else INVALID_OAUTH_STATE
  A->>L: verifyCallback(code, pending)
  L->>P: verifyCallback(code, pending)
  P->>G: exchangeCode(code, codeVerifier), verifyIdToken(idToken)
  P->>P: nonce matches? sub and email present?
  alt anything fails
    P-->>L: AuthDomainError INVALID_ID_TOKEN, cause attached
    L->>L: log the error class and Google's code only
    L-->>A: rethrow
    A->>S: recordDenial(code)
    A-->>C: the error
    C-->>B: 302 /login?error=INVALID_ID_TOKEN
  else verified
    P-->>A: ExternalIdentity
    A->>A: RateLimiter.consume("sign-in:sub", 10/min)
    A->>S: signIn(identity, "google", userAgent)
  end
```

**Where in the code:** `backend/src/auth/application/auth.service.ts`, `backend/src/auth/infrastructure/logging-identity.provider.ts`,
`backend/src/auth/infrastructure/google-identity.provider.ts`, `backend/src/auth/infrastructure/google-oauth.client.ts`

### 1c. Google sign-in: role resolution and the session

One transaction. A denial is returned rather than thrown, so its audit row commits.

```mermaid
%%{init: {"sequence": {"wrap": true, "width": 170}}}%%
sequenceDiagram
  participant S as SignInService
  participant R as RoleResolver
  participant F as FacultyDirectory
  participant U as UsersService
  participant T as SessionService
  participant AU as AuditService
  participant DB as PostgreSQL
  participant C as AuthController
  actor B as Browser

  S->>DB: BEGIN
  S->>S: emailVerified? hostedDomain allowed? else deny and audit
  S->>U: findByGoogleSub(sub)
  S->>U: findByEmail(email), when sub is unknown: pre-registered?
  S->>F: isApproved(email), staff emails only
  S->>R: resolve(identity, existingUser, isBootstrapAdmin, isApprovedFaculty)
  R-->>S: ASSIGNED role, or DENIED
  opt pre-registered account
    S->>U: claim(id, sub), only WHERE googleSub IS NULL
    S->>AU: record(USER_CLAIMED)
  end
  alt known user
    S->>U: recordLogin, and changeRole if it differs
  else new user
    S->>U: register(user)
    S->>AU: record(USER_CREATED), record(ROLE_ASSIGNED)
  end
  opt role is PENDING_STAFF
    S->>F: createRequestIfAbsent(userId, email)
  end
  S->>T: startFamily(userId, userAgent, tx)
  T->>DB: INSERT RefreshToken (hash only)
  S->>AU: record(LOGIN_SUCCEEDED)
  S->>DB: COMMIT
  S-->>C: SignedIn with refresh token
  C-->>B: Set-Cookie flowforge_refresh, 302 /auth/callback
  B->>C: POST /api/auth/refresh, for the first access token
```

**Where in the code:** `backend/src/auth/application/sign-in.service.ts`, `backend/src/auth/domain/role-resolver.ts`,
`backend/src/auth/application/session.service.ts`, `backend/test/auth.e2e.ts`

### 2a. Refresh: rotation

Each refresh revokes the presented token and issues its successor, in one transaction.

```mermaid
%%{init: {"sequence": {"wrap": true, "width": 170}}}%%
sequenceDiagram
  actor B as Browser
  participant C as AuthController
  participant A as AuthService
  participant S as SessionService
  participant R as RefreshTokenRepository
  participant L as RateLimiter
  participant J as TokenSigner
  participant DB as PostgreSQL

  B->>C: POST /api/auth/refresh with cookie and Origin
  Note over C: OriginGuard: Origin must equal FRONTEND_URL
  C->>A: refresh(cookie, userAgent)
  A->>S: rotate(presented, userAgent)
  S->>DB: BEGIN
  S->>R: findByHash(sha256(presented))
  alt unknown
    S-->>C: INVALID_REFRESH_TOKEN, cookie cleared
  end
  S->>L: consume("refresh:family", 10/min, tx)
  alt over the limit
    S-->>C: TOO_MANY_REQUESTS, cookie kept
  end
  S->>R: revokeIfActive(id), UPDATE WHERE revokedAt IS NULL
  S->>R: create(successor), markReplaced(id, successorId)
  S->>DB: COMMIT
  A->>J: sign(sub, ver)
  C-->>B: 200 accessToken, Set-Cookie successor
```

**Where in the code:** `backend/src/auth/application/session.service.ts`, `backend/src/auth/infrastructure/prisma-refresh-token.repository.ts`,
`backend/src/auth/presentation/auth.controller.ts`, `backend/test/sessions.e2e.ts`

### 2b. Refresh: a token presented again

A second use within 10 seconds, while the family has a live token, gets a sibling: that's two tabs or a retry, not theft. Later, it's reuse, and the whole family ends.

```mermaid
%%{init: {"sequence": {"wrap": true, "width": 170}}}%%
sequenceDiagram
  actor B as Browser
  participant S as SessionService
  participant R as RefreshTokenRepository
  participant DB as PostgreSQL

  B->>S: rotate(a token that was already rotated)
  Note over S: Also reached when revokeIfActive loses a race:<br/>it reads what the winner did, then continues here
  S->>S: rotatedAgain: within 10 s of its rotation?
  S->>R: hasActiveToken(familyId, now)
  alt within 10 s and the family has a live token
    S->>R: create(sibling, same family)
    S->>DB: COMMIT
    S-->>B: 200 accessToken, Set-Cookie sibling
  else later, or nothing live is left
    S->>R: revokeFamily(familyId)
    S->>DB: INSERT AuditLog REFRESH_TOKEN_REUSE_DETECTED
    S->>DB: COMMIT, because the denial is returned, not thrown
    S-->>B: 401 REFRESH_TOKEN_REUSED, cookie cleared
  end
```

**Where in the code:** `backend/src/auth/application/session.service.ts` (`rotatedAgain`, `handleReuse`), `backend/test/sessions.e2e.ts`

### 2c. Refresh during a database outage: 503, and nobody is signed out

Only an answer about the session clears the cookie. A database failure doesn't.

```mermaid
%%{init: {"sequence": {"wrap": true, "width": 170}}}%%
sequenceDiagram
  actor B as Browser client
  participant C as AuthController
  participant S as SessionService
  participant DB as PostgreSQL
  participant F as ApiExceptionFilter

  B->>C: POST /api/auth/refresh
  C->>S: rotate(presented)
  S-xDB: BEGIN fails: connection refused
  S-->>C: driver error, not a DomainError
  Note over C: Not in SESSION_ENDED, so the cookie stays
  C-->>F: rethrow
  F->>F: isDatabaseUnavailable(error) is true
  F-->>B: 503 SERVICE_UNAVAILABLE
  Note over B: refreshUntilAnswered: 5xx is transient. A banner shows,<br/>and it retries after 1, 2, 4, 8, then every 15 seconds
  B->>C: POST /api/auth/refresh, once the database is back
  C-->>B: 200 accessToken. Still signed in
```

**Where in the code:** `backend/src/auth/presentation/auth.controller.ts` (`SESSION_ENDED`),
`backend/src/common/errors/database-errors.ts`, `backend/src/common/errors/api-exception.filter.ts`, `frontend/src/api/client.ts`,
`frontend/src/auth/AuthProvider.tsx`, `backend/test/database-outage.e2e.ts`, `tests/e2e/resilience.spec.ts`

### 3. Create and publish

Creating saves the cycle and its milestones together. Publishing runs every registered check under the cycle's row lock,
and commits the status and audit row together.

```mermaid
%%{init: {"sequence": {"wrap": true, "width": 170}}}%%
sequenceDiagram
  actor Fa as Faculty
  participant S as CourseCycleService
  participant W as CycleWorkflow
  participant P as PublishChecks
  participant CP as CyclePublishChecks
  participant IP as IdeaPublishCheck
  participant R as CycleRepository
  participant AU as AuditService
  participant DB as PostgreSQL

  Note over P,IP: At startup, onModuleInit registers each check with PublishChecks
  Fa->>S: POST /course-cycles (draft, with milestones)
  S->>W: assertValidSchedule(data and milestones)
  S->>DB: BEGIN
  S->>R: create(data, milestones, tx)
  S->>AU: record(CYCLE_CREATED, tx)
  S->>DB: COMMIT
  Fa->>S: POST /course-cycles/:id/publish
  S->>DB: BEGIN
  S->>R: lockById(id, tx), SELECT ... FOR UPDATE
  S->>S: policy.assertOwner, else 404 CYCLE_NOT_FOUND
  S->>W: transition(status, "PUBLISH"), else 409
  S->>P: run(cycle, tx)
  P->>CP: schedule, roster, students
  P->>IP: idea list when ideas come only from it
  P-->>S: blocking and warnings, all of them
  alt any blocking finding
    S-->>Fa: 409 PUBLISH_BLOCKED with details, rolled back
  else none
    S->>R: transitionStatus(id, DRAFT, PUBLISHED, now, tx)
    S->>AU: record(CYCLE_PUBLISHED, warnings, tx)
    S->>DB: COMMIT
    S-->>Fa: 200 cycle and warnings
  end
```

**Where in the code:** `backend/src/course-cycles/application/course-cycle.service.ts`, `backend/src/course-cycles/application/publish-checks.ts`,
`backend/src/course-cycles/application/cycle-publish-checks.ts`, `backend/src/ideas/application/idea-publish-check.ts`,
`backend/src/course-cycles/infrastructure/prisma-cycle.repository.ts`, `backend/test/course-cycles.e2e.ts`

### 4. Form a team, and the deadline lock

Nothing runs at the deadline. Each request compares the clock with `teamDeadline`, and the database settles a race.

```mermaid
%%{init: {"sequence": {"wrap": true, "width": 170}}}%%
sequenceDiagram
  actor L as Leader
  participant S as TeamFormationService
  participant C as TeamCycles
  participant TR as TeamRules
  participant R as TeamRepository
  participant AU as AuditService
  participant DB as PostgreSQL

  L->>S: POST /course-cycles/:cycleId/teams {name, memberIds}
  S->>C: getVisible(actor, cycleId), else 404
  S->>TR: assertFormationOpen(cycle, clock.now())
  alt now is at or after teamDeadline
    TR-->>L: 409 TEAM_FORMATION_CLOSED
  end
  S->>TR: otherMembers, assertSize(others + 1, cycle)
  S->>C: rosterOf(cycle)
  S->>DB: BEGIN
  S->>TR: assertEligible(roster, others, users)
  S->>R: findMemberships(cycleId, everyone, tx)
  S->>TR: assertAvailable(memberships, users), else 409
  S->>R: create(team, tx)
  R->>DB: INSERT Team, INSERT TeamMember rows
  alt another leader just took a student
    DB-->>R: unique violation on (cycleId, userId)
    R-->>L: 409 STUDENT_ALREADY_IN_TEAM, rolled back
  else
    S->>DB: DELETE TeamSeeker rows, INSERT AuditLog TEAM_CREATED
    S->>DB: COMMIT
    S-->>L: 201 team
  end
  Note over L,DB: Later, a change after the deadline
  L->>S: PATCH /teams/:teamId
  S->>TR: assertFormationOpen(cycle, clock.now())
  TR-->>L: 409 TEAM_FORMATION_CLOSED
```

**Where in the code:** `backend/src/teams/application/team-formation.service.ts`, `backend/src/teams/domain/team-rules.ts`,
`backend/src/teams/infrastructure/prisma-team.repository.ts`, `backend/test/teams.e2e.ts`

### 5. Idea: propose, reject, revise, approve

Every change takes the team's and the idea's row locks. A decision names the version the faculty member read.

```mermaid
%%{init: {"sequence": {"wrap": true, "width": 170}}}%%
sequenceDiagram
  actor L as Leader
  actor Fa as Faculty
  participant S as IdeaService
  participant T as IdeaTeams
  participant RU as IdeaRules
  participant R as IdeaRepository
  participant DB as PostgreSQL

  L->>S: PUT /teams/:teamId/idea {title, problem, solution, links}
  S->>T: getVisible, assertLeader, assertProposalsAllowed, clean
  S->>DB: BEGIN
  S->>R: lockTeamIdea: Team FOR SHARE, ProjectIdea FOR UPDATE
  S->>RU: submissionAction(null, cycle, now), returns CREATE
  S->>R: create(idea v1, SUBMITTED, tx)
  S->>DB: audit IDEA_SUBMITTED, COMMIT
  Fa->>S: POST /teams/:teamId/idea/review {version 1, REJECTED, feedback}
  S->>RU: assertReviewer, feedbackFor, else 400 IDEA_FEEDBACK_REQUIRED
  S->>DB: BEGIN, lockTeamIdea
  S->>RU: assertCanReview(idea, cycle, 1)
  S->>R: review(id, decision, tx): IdeaReview row, status REJECTED
  S->>DB: audit IDEA_REJECTED, COMMIT
  L->>S: PUT /teams/:teamId/idea (revised)
  S->>DB: BEGIN, lockTeamIdea
  S->>RU: submissionAction(REJECTED), returns RESUBMIT, even after the deadline
  S->>R: revise(id, v2, SUBMITTED, tx)
  S->>DB: audit IDEA_SUBMITTED, COMMIT
  Fa->>S: POST /teams/:teamId/idea/review {version 2, APPROVED}
  S->>DB: BEGIN, lockTeamIdea
  S->>RU: assertCanReview(idea, cycle, 2)
  Note over S,RU: Naming version 1 now would give 409 IDEA_CHANGED
  S->>R: review(id, decision, tx): status APPROVED, final
  S->>DB: audit IDEA_APPROVED, COMMIT
```

**Where in the code:** `backend/src/ideas/application/idea.service.ts`, `backend/src/ideas/domain/idea-rules.ts`,
`backend/src/ideas/infrastructure/prisma-idea.repository.ts`, `backend/test/ideas.e2e.ts`

### 6. Submit work

Validation first, then a rate limit, then a short transaction under the team's row lock.

```mermaid
%%{init: {"sequence": {"wrap": true, "width": 170}}}%%
sequenceDiagram
  actor M as Member
  participant W as WriteRateLimitGuard
  participant S as SubmissionService
  participant T as SubmissionTeams
  participant RU as SubmissionRules
  participant LR as LinkRequirement
  participant L as RateLimiter
  participant R as SubmissionRepository
  participant DB as PostgreSQL

  M->>W: POST /teams/:teamId/milestones/:milestoneId/submissions
  W->>L: consume("writes:userId", 120/min)
  W->>S: submit(actor, teamId, milestoneId, content)
  S->>T: getVisible(actor, teamId), else 404 TEAM_NOT_FOUND
  S->>RU: milestoneOf(cycle, milestoneId), else 404
  S->>RU: assertCanSubmit: member? window open? idea approved?
  S->>RU: clean(content, milestone)
  RU->>LR: check(links): allowed type, valid URL, required present
  S->>L: consume("submit:userId:milestoneId", 10/min)
  alt over the limit
    S-->>M: 429 TOO_MANY_REQUESTS
  end
  S->>DB: BEGIN
  S->>R: lockLatestVersion: Team FOR UPDATE, MAX(version)
  S->>RU: assertBelowVersionLimit(latest, 50)
  S->>R: create(version latest + 1, tx)
  alt the version was taken anyway
    R-->>M: 409 SUBMISSION_CHANGED
  end
  S->>DB: audit SUBMISSION_CREATED, COMMIT
  S-->>M: 201 the new version
```

**Where in the code:** `backend/src/submissions/application/submission.service.ts`, `backend/src/submissions/domain/submission-rules.ts`,
`backend/src/common/links/link-requirement.ts`, `backend/src/common/links/link-validators.ts`,
`backend/src/submissions/infrastructure/prisma-submission.repository.ts`,
`backend/src/auth/presentation/guards/write-rate-limit.guard.ts`, `backend/test/submissions.e2e.ts`, `backend/test/write-limits.e2e.ts`

### 7. Feedback: optimistic save, release, student read

Saves don't block each other. A save based on an old version is refused. Students are filtered in the query itself.

```mermaid
%%{init: {"sequence": {"wrap": true, "width": 170}}}%%
sequenceDiagram
  actor Fa as Faculty
  actor St as Student
  participant S as EvaluationService
  participant RU as EvaluationRules
  participant PO as EvaluationPolicy
  participant R as EvaluationRepository
  participant DB as PostgreSQL

  Fa->>S: PUT .../teams/:teamId/evaluation {feedback, expectedVersion}
  S->>PO: assertCanGrade, assertCanReadTeam, else 404
  S->>RU: assertGradingOpen, else 409
  S->>DB: BEGIN
  S->>R: shareGrading: MilestoneGrading FOR SHARE
  S->>RU: clean(input, grading, marksEnabled), else 400
  S->>R: findByTeam(milestoneId, teamId, tx)
  S->>RU: nextVersion(current, expectedVersion), else 409 EVALUATION_CHANGED
  S->>R: save: UPDATE WHERE version = n-1, INSERT EvaluationRevision
  alt a concurrent save won
    R-->>Fa: 409 EVALUATION_CHANGED
  end
  S->>DB: audit EVALUATION_SAVED, COMMIT
  Fa->>S: POST .../grading/release
  S->>DB: BEGIN
  S->>R: lockGrading: MilestoneGrading FOR UPDATE
  S->>RU: assertCanRelease(grading, graded), else 409
  S->>R: release: UPDATE WHERE releasedAt IS NULL
  S->>DB: audit EVALUATION_RELEASED, COMMIT
  St->>S: GET .../teams/:teamId/evaluations
  S->>PO: assertCanReadTeam, a member of this team? else 404
  S->>PO: releasedOnly(actor), true for a student
  S->>R: listReleasedForMember(userId, [teamId])
  Note over R,DB: WHERE teamId IN (...)<br/>AND the team has this member<br/>AND the milestone's releasedAt IS NOT NULL
  R-->>St: feedback once released. Before release: []
```

**Where in the code:** `backend/src/evaluations/application/evaluation.service.ts`, `backend/src/evaluations/domain/evaluation-rules.ts`,
`backend/src/evaluations/domain/evaluation-policy.ts`, `backend/src/evaluations/infrastructure/prisma-evaluation.repository.ts`,
`backend/test/evaluations.e2e.ts`, `backend/test/evaluations-feedback-only.e2e.ts`

### 8. The student dashboard

Each source is read once for all of the student's projects, then to-dos and updates are computed in memory. Nothing is stored.

```mermaid
%%{init: {"sequence": {"wrap": true, "width": 170}}}%%
sequenceDiagram
  actor St as Student
  participant C as DashboardController
  participant D as DashboardService
  participant SR as StudentSources
  participant CY as CourseCycleService
  participant TE as TeamQueryService
  participant ID as IdeaService
  participant SU as SubmissionService
  participant EV as EvaluationService
  participant TO as StudentTodoRules

  St->>C: GET /api/me/dashboard
  C->>D: forStudent(actor)
  par first round
    D->>SR: activeCycles
    SR->>CY: listVisible
    D->>SR: pastCycles
    SR->>CY: listPastForStudent
    D->>SR: upcomingEvents
    SR->>CY: upcomingFor
    D->>SR: myTeams
    SR->>TE: listMine
  end
  par second round, with the team ids
    D->>SR: ideasOf(teamIds)
    SR->>ID: listForOwnTeams, one query
    D->>SR: submittedMilestones(teamIds)
    SR->>SU: submittedMilestones, one query
    D->>SR: releasedResults(userId, teamIds)
    SR->>EV: releasedForMember, one query
  end
  loop each project, in memory
    D->>TO: itemsFor(context): the to-dos
  end
  D->>D: buildUpdates: membership, reviews, results
  D-->>St: upNext, updates, projects (active, past)
```

`dashboard.e2e.ts` checks that the number of statements is the same whether the student has 1 project or 5.

**Where in the code:** `backend/src/dashboard/application/dashboard.service.ts`, `backend/src/dashboard/infrastructure/modules-student-sources.ts`,
`backend/src/dashboard/domain/student-todo-rules.ts`, `backend/src/dashboard/domain/dashboard-feed.ts`, `backend/test/dashboard.e2e.ts`

## 6.2 Activity diagrams

### The project lifecycle: setup to teams

Who does what until teams are settled. Time-based steps have no job behind them: each one follows from comparing the clock with a stored date.

```mermaid
flowchart TB
  subgraph F1 ["Faculty"]
    A1["Create a draft: details, team rules, milestones"] --> A2{"Elective?"}
    A2 -- "yes" --> A3["Enroll students"]
    A2 -- "no" --> A4["Optionally register the batch"]
    A3 --> A5["Review and publish"]
    A4 --> A5
    A5 --> A6{"Blocking problem?"}
    A6 -- "yes" --> A7["Fix what's listed"]
    A7 --> A5
  end
  subgraph S1 ["Students, until teamDeadline"]
    B1["Create or change teams"]
    B2["Mark 'looking for a team'"]
  end
  subgraph F2 ["Faculty, teamDeadline until ideaDeadline"]
    C1["Place students without a team, by hand or auto-group"]
  end
  A6 -- "no" --> B1
  A6 -- "no" --> B2
  B1 --> C1
  B2 --> C1
```

**Where in the code:** `backend/src/course-cycles/application/course-cycle.service.ts`, `backend/src/teams/domain/team-rules.ts`, `tests/e2e/lifecycle.spec.ts`

### The project lifecycle: ideas to closing

From a team's idea to the closed project. The middle part repeats for each milestone.

```mermaid
flowchart TB
  subgraph S2 ["Leaders, until ideaDeadline"]
    D1["Propose an idea, or pick from the list"]
  end
  subgraph F3 ["Faculty, while published"]
    E1{"Approve?"}
    E2["Reject with feedback"]
    E3["Approved: final"]
  end
  subgraph S3 ["Team, per milestone: opens until due"]
    G1["Any member adds versions"]
  end
  subgraph F4 ["Faculty, per milestone: from due"]
    H1["Save feedback for each team"]
    H2["Release to all teams at once"]
    H3["Correct if needed: shown as updated"]
  end
  subgraph F5 ["Faculty"]
    I1["Close the project: read-only"]
  end
  D1 --> E1
  E1 -- "yes" --> E3
  E1 -- "no" --> E2
  E2 -- "leader revises or picks" --> E1
  E3 --> G1
  G1 --> H1
  H1 --> H2
  H2 --> H3
  H3 -- "next milestone" --> G1
  H3 -- "after the last" --> I1
```

A pick is approved at once and skips the review. **Where in the code:** `backend/src/ideas/domain/idea-rules.ts`, `backend/src/submissions/domain/submission-rules.ts`,
`backend/src/evaluations/domain/evaluation-rules.ts`, `backend/src/course-cycles/domain/cycle-timeline.ts`, `tests/e2e/lifecycle.spec.ts`

### Submit work: the checks before the transaction

Each refusal returns its reason, and nothing has been locked yet. The checks run in this order; the table after the diagram says what each one means.

```mermaid
flowchart LR
  subgraph Mem ["Member"]
    M1["Submits links and notes"]
  end
  subgraph Api ["API"]
    A1{"Writes OK?"}
    A2{"Body valid?"}
    A3{"Reachable?"}
    A6{"Open?"}
    A8{"Links OK?"}
    A9{"Rate OK?"}
    NEXT(["To the transaction"])
    X1(["Refused: 429"])
    X2(["Refused: 400"])
    X3(["Refused: 404"])
    X6(["Refused: 409"])
    X8(["Refused: 400"])
    X9(["Refused: 429"])
  end
  M1 --> A1
  A1 -- "yes" --> A2
  A2 -- "yes" --> A3
  A3 -- "yes" --> A6
  A6 -- "yes" --> A8
  A8 -- "yes" --> A9
  A9 -- "yes" --> NEXT
  A1 -- "no" --> X1
  A2 -- "no" --> X2
  A3 -- "no" --> X3
  A6 -- "no" --> X6
  A8 -- "no" --> X8
  A9 -- "no" --> X9
```

| Decision | What it checks | Refusal |
| --- | --- | --- |
| Writes OK? | Under 120 writes this minute, for this user | `429 TOO_MANY_REQUESTS` |
| Body valid? | The DTO's fields, types and lengths | `400 VALIDATION_FAILED` |
| Reachable? | The team is visible, the milestone belongs to its cycle, and the caller is a member | `404 TEAM_NOT_FOUND`, `404 MILESTONE_NOT_FOUND` |
| Open? | The window is open, and the team's idea is approved | `409 SUBMISSION_NOT_OPEN`, `SUBMISSION_CLOSED`, `IDEA_NOT_APPROVED` |
| Links OK? | The links meet the milestone's requirement | `400 MISSING_REQUIRED_LINK`, `LINK_NOT_ALLOWED`, `INVALID_LINK` |
| Rate OK? | Under 10 submissions this minute, for this member and milestone | `429 TOO_MANY_REQUESTS` |

**Where in the code:** `backend/src/submissions/application/submission.service.ts`, `backend/src/submissions/domain/submission-rules.ts`,
`backend/src/auth/presentation/guards/write-rate-limit.guard.ts`, `backend/src/common/links/link-requirement.ts`

### Submit work: the transaction

The team's row lock makes members take turns, so each gets the next version number.

```mermaid
flowchart TB
  subgraph Db ["Database, one transaction"]
    D1["Lock the team row, read the latest version"]
    D2{"Below 50 versions?"}
    D3["Insert version + 1, and audit it"]
    D4{"Unique key violated?"}
  end
  subgraph Mem ["Member"]
    M2["Sees the new version"]
    M3["Sees the reason"]
  end
  D1 --> D2
  D2 -- "no: 409 VERSION_LIMIT_REACHED" --> M3
  D2 -- "yes" --> D3
  D3 --> D4
  D4 -- "yes: 409 SUBMISSION_CHANGED" --> M3
  D4 -- "no: commit" --> M2
```

**Where in the code:** `backend/src/submissions/application/submission.service.ts`, `backend/src/submissions/infrastructure/prisma-submission.repository.ts`

### Sign-in: verifying the answer

From the first click to a verified identity.

```mermaid
flowchart LR
  subgraph Br ["Browser"]
    B1["Sign in with Google"]
    B3["Login page with the reason"]
  end
  subgraph Goo ["Google"]
    G1["Chooses an account, returns a code"]
  end
  subgraph Api ["API"]
    A1{"State matches this browser?"}
    A2{"Code exchanged, ID token valid, nonce matches?"}
    A3{"Email verified and hosted domain allowed?"}
    NEXT(["To role resolution"])
  end
  B1 --> G1
  G1 --> A1
  A1 -- "yes" --> A2
  A2 -- "yes" --> A3
  A3 -- "yes" --> NEXT
  A1 -- "no: INVALID_OAUTH_STATE" --> B3
  A2 -- "no: INVALID_ID_TOKEN" --> B3
  A3 -- "no: EMAIL_NOT_VERIFIED or WRONG_HOSTED_DOMAIN" --> B3
```

**Where in the code:** `backend/src/auth/application/auth.service.ts`, `backend/src/auth/application/sign-in.service.ts`, `backend/src/auth/infrastructure/google-identity.provider.ts`

### Sign-in: role resolution

The order of the checks in `RoleResolver` is the rule: deactivation first, then a student email is always `STUDENT`, and only a staff-shaped email can become anything else.

```mermaid
flowchart TB
  subgraph Api ["API"]
    A4{"Existing account deactivated?"}
    A5{"What does the email look like?"}
    A6{"Bootstrap admin, or already an admin?"}
    A7{"On the faculty allowlist?"}
    R1["Role: STUDENT"]
    R2["Role: ADMIN"]
    R3["Role: FACULTY"]
    R4["Role: PENDING_STAFF, request created"]
    S1["Create or update the user, start a refresh family, audit"]
  end
  subgraph Br ["Browser"]
    B2["The app, signed in"]
    B3["Login page with the reason"]
  end
  A4 -- "yes: ACCOUNT_DEACTIVATED" --> B3
  A4 -- "no" --> A5
  A5 -- "neither: EMAIL_NOT_ELIGIBLE" --> B3
  A5 -- "student" --> R1
  A5 -- "staff" --> A6
  A6 -- "yes" --> R2
  A6 -- "no" --> A7
  A7 -- "yes" --> R3
  A7 -- "no" --> R4
  R1 --> S1
  R2 --> S1
  R3 --> S1
  R4 --> S1
  S1 --> B2
```

**Where in the code:** `backend/src/auth/application/sign-in.service.ts`, `backend/src/auth/domain/role-resolver.ts`, `backend/src/auth/infrastructure/rishihood-identity-parser.ts`

## 6.3 State diagrams

### Cycle

The stored state is `status`. The stages inside `PUBLISHED` are computed by `CycleTimeline`, and never stored.

```mermaid
stateDiagram-v2
  [*] --> DRAFT: create
  DRAFT --> DRAFT: edit anything
  DRAFT --> PUBLISHED: publish, when no check blocks
  PUBLISHED --> CLOSED: close
  CLOSED --> [*]
  state PUBLISHED {
    [*] --> TEAMS
    TEAMS --> IDEAS: teamDeadline
    IDEAS --> MILESTONE: ideaDeadline
    MILESTONE --> WRAP_UP: last evaluationAt
    state MILESTONE {
      [*] --> UPCOMING
      UPCOMING --> OPEN: submissionOpensAt
      OPEN --> AWAITING_EVALUATION: submissionDueAt
      AWAITING_EVALUATION --> UPCOMING: evaluationAt, next milestone
    }
  }
```

There's no `CLOSED → PUBLISHED` or `PUBLISHED → DRAFT`: `CycleWorkflow.transitions` has no such entry, so they answer
`409 CYCLE_ALREADY_CLOSED` or `409 INVALID_STATUS_TRANSITION`.

**Where in the code:** `backend/src/course-cycles/domain/cycle-workflow.ts`, `backend/src/course-cycles/domain/cycle-timeline.ts`

### Submission

**A submission has no stored state.** Each version is an immutable row, so there's nothing to transition. What changes is
the milestone's window, computed by `SubmissionRules.window`. The newest version before the due time is the team's final
work, with no "final" flag to disagree with it.

```mermaid
stateDiagram-v2
  [*] --> NOT_OPEN: cycle published, now is before submissionOpensAt
  NOT_OPEN --> OPEN: submissionOpensAt
  OPEN --> OPEN: a member adds a version
  OPEN --> CLOSED: submissionDueAt, exactly at that moment
  NOT_OPEN --> CLOSED: cycle closed
  OPEN --> CLOSED: cycle closed
  CLOSED --> [*]
```

**Where in the code:** `backend/src/submissions/domain/submission-rules.ts` (`window`), `backend/src/submissions/domain/submission.ts`

### Idea

The stored `status` of `ProjectIdea`. Every change of content raises `version`.

```mermaid
stateDiagram-v2
  [*] --> SUBMITTED: leader proposes, before ideaDeadline
  [*] --> APPROVED: leader picks from the list, before ideaDeadline
  SUBMITTED --> SUBMITTED: leader edits, before ideaDeadline
  SUBMITTED --> APPROVED: owner approves the version read
  SUBMITTED --> APPROVED: leader picks instead, before ideaDeadline
  SUBMITTED --> REJECTED: owner rejects, with feedback
  REJECTED --> SUBMITTED: leader revises, any time while published
  REJECTED --> APPROVED: leader picks, any time while published
  APPROVED --> [*]
```

An idea left in `SUBMITTED` when the deadline passes stays there: the leader can't edit it (`IDEA_SUBMISSION_CLOSED`), and
the owner can still review it. Once the cycle is closed, nothing changes (`IDEA_REVIEW_CLOSED`, `IDEA_RESUBMISSION_CLOSED`).

**Where in the code:** `backend/src/ideas/domain/idea-rules.ts` (`submissionAction`, `assertCanReview`), `backend/src/ideas/domain/idea.ts`

### Evaluation

There's no status column. The state is derived from whether a row exists and whether its milestone's `releasedAt` is set.

```mermaid
stateDiagram-v2
  [*] --> NotGraded: milestone due, cycle published
  NotGraded --> Hidden: first save, version 1
  Hidden --> Hidden: save, version + 1, expectedVersion must match
  Hidden --> Released: owner releases the milestone
  NotGraded --> ReleasedWithout: owner releases; this team has no evaluation
  ReleasedWithout --> Updated: first save after release, visible at once
  Released --> Updated: save after release
  Updated --> Updated: another save
  Released --> [*]
  Updated --> [*]
```

`Updated` is `EvaluationRules.isUpdatedAfterRelease`: `updatedAt > releasedAt`. Release is one-way, because no code sets
`releasedAt` back to null. A release needs at least one graded team (`NOTHING_TO_RELEASE`).

**Where in the code:** `backend/src/evaluations/domain/evaluation-rules.ts`, `backend/src/evaluations/infrastructure/prisma-evaluation.repository.ts`,
`backend/test/evaluations.e2e.ts`

### Team (there is no team invite)

**A team invite doesn't exist in FlowForge.** ADR 007 decided that a leader adds members directly, and they're members at
once, so there's no invitation table, status or route (`backend/src/teams/application/team-formation.service.ts`). This
diagram shows the real lifecycle of a team instead. Membership has no stored state either: a `TeamMember` row exists or it
doesn't.

```mermaid
stateDiagram-v2
  [*] --> Forming: leader creates it, before teamDeadline
  [*] --> Placed: faculty create it or auto-group, teamDeadline until ideaDeadline
  Forming --> Forming: leader renames or changes members
  Forming --> [*]: leader disbands; member rows and idea go with it
  Forming --> Fixed: teamDeadline, or the cycle closes
  Placed --> Placed: faculty add a member, while there's room
  Placed --> Fixed: ideaDeadline, or the cycle closes
  Fixed --> Fixed: faculty add a member, until ideaDeadline
  Fixed --> [*]: never deleted
```

**Where in the code:** `backend/src/teams/domain/team-rules.ts`, `backend/src/teams/application/team-formation.service.ts`,
`backend/src/teams/application/team-completion.service.ts`, `docs/decisions/007-leader-forms-team-without-invitations.md`

### Refresh-token family

The session's life, with the grace window from ADR 023.

```mermaid
stateDiagram-v2
  [*] --> Live: sign-in starts a family
  Live --> Live: refresh rotates the token
  Live --> Live: rotated token again within 10 s, a sibling is issued
  Live --> Ended: rotated token again after 10 s, reuse detected
  Live --> Ended: sign out, sign out everywhere, or deactivation
  Live --> Expired: token or family expires
  Ended --> [*]
  Expired --> [*]
```

**Where in the code:** `backend/src/auth/application/session.service.ts`
