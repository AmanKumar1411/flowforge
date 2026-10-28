# Project ideas and pre-registered students (Phase 6)

Each team proposes one project idea; the faculty who own the cycle approve or reject it. A
rejected idea goes back to the team, which revises and resubmits it. The team never changes
because of its idea. Decisions: [ADR 013](../decisions/013-project-ideas.md) (ideas) and
[ADR 012](../decisions/012-pre-registered-students.md) (students registered before they sign in).

## The stages of a cycle

```mermaid
timeline
  title One cycle, one stage after another
  Formation (D1) : students form and change their own teams
                 : "looking for a team"
  Completion (D2) : owning faculty place students without a team
                  : by hand or auto-group
  Ideas (D3) : leaders submit, edit while waiting
             : faculty review any time
  Submissions open : rejected ideas can no longer be resubmitted
```

`D1 <= D2 <= D3 <= submissionStartAt < submissionDeadline`, checked on every save and by a
database CHECK. D2 defaults to D1 and D3 to D2; a later stage that ends together with a moved one
moves with it. On a published cycle a stage deadline moves only while that stage is open, and
only into the future.

## An idea's life

```mermaid
stateDiagram-v2
  [*] --> SUBMITTED: leader submits (before D3), version 1
  SUBMITTED --> SUBMITTED: leader edits (before D3), version + 1
  SUBMITTED --> APPROVED: owning faculty approve the version they read
  SUBMITTED --> REJECTED: owning faculty reject, with feedback
  REJECTED --> SUBMITTED: leader resubmits (before submissions open), version + 1
  APPROVED --> [*]
```

| Who | Read the idea | Submit, edit, resubmit | Review | List the cycle's ideas |
| --- | --- | --- | --- | --- |
| Team leader | yes | yes | – | – |
| Team member | yes | `403 NOT_TEAM_LEADER` | – | – |
| Other students | `404` | `404` | – | `403` |
| Owning faculty | yes | – | yes | yes |
| Other faculty | `404` | – | `404` | `404` |
| Admin | yes | – | `403` | yes |

## Modules and layers

```mermaid
flowchart TB
  subgraph ideas
    P[presentation<br/>IdeasController (teams/:id/idea), CycleIdeasController (course-cycles/:id/ideas), DTOs]
    A[application<br/>IdeaService<br/>ports: IdeaRepository, IdeaTeams]
    D[domain<br/>IdeaRules, idea types, IdeaDomainError]
    I[infrastructure<br/>PrismaIdeaRepository, TeamsIdeaTeams]
    P --> A --> D
    I -. implements .-> A
  end
  I --> teams[teams<br/>TeamQueryService: who may see a team]
  I --> cycles[course-cycles<br/>CourseCycleService: visible cycles]
  A --> audit[audit]
```

- `IdeaRules` is plain TypeScript and holds every window and transition; `IdeaService` only loads,
  locks, asks the rules and saves.
- A write locks the team row `FOR SHARE` (so a disband waits) and the idea row `FOR UPDATE`, then
  re-reads the idea. Two saves of one idea run one after the other.
- The version goes up with every content change. A review names the version it read; a newer one
  is refused (`409 IDEA_CHANGED`). Reviews are kept (`IdeaReview`, one per version).

## Pre-registered students

```mermaid
sequenceDiagram
  participant F as Faculty
  participant API
  participant S as Student
  F->>API: POST batch-students / enrollments (emails)
  API->>API: StudentPreRegistration: student email? valid batch? one account per email
  API-->>F: registered, already registered, rejected rows
  Note over API: User(googleSub = null, lastLoginAt = null)
  S->>API: first sign-in (Google or dev)
  API->>API: no user with this sub → user with this email and no sub?
  API->>API: claim: UPDATE … SET googleSub WHERE googleSub IS NULL, audit USER_CLAIMED
  API-->>S: signed in as the same user, already in their team
```

Until then the student is an ordinary active student with `signedIn: false`: listed in the batch
and enrollment lists, found by leaders' search, and placed by the faculty.

## Design defense

| Question | Answer | Where |
| --- | --- | --- |
| Why its own idea deadline? | Teams the faculty create late in their window still get time to write an idea. | ADR 013, `cycle-workflow.ts: assertValidSchedule` |
| Why version every edit? | A review must decide exactly the text the faculty member read. | `idea-rules.ts: assertCanReview` |
| Why may the faculty review before D3? | An early decision helps the team; a rejected team can resubmit until submissions open. | `idea-rules.ts: submissionAction` |
| Why claim by email only without a sub? | A signed-in account keeps ADR 003's protection; an unclaimed one was vouched for by the faculty. | `sign-in.service.ts: claim` |
| Why derive names from emails? | A readable list before the first sign-in, replaced by Google's name at sign-in. | `student-pre-registration.ts: nameFromEmail` |
