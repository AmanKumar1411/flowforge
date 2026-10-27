# Course / Project Cycle Management

Phase 2 adds the faculty-owned academic context that later project features attach to. It is intentionally a modular-monolith slice: one Nest application, one PostgreSQL database, and a React client.

## Component flow

```mermaid
flowchart LR
  React[React cycle screens] --> Controller[CourseCycleController]
  Controller --> Service[CourseCycleService]
  Service --> Workflow[CycleWorkflow]
  Service --> Policy[CycleAuthorizationPolicy]
  Service --> Repository[CycleRepository]
  Repository --> Prisma[PrismaCycleRepository]
  Prisma --> PostgreSQL[(PostgreSQL)]
```

## Create sequence

```mermaid
sequenceDiagram
  actor Faculty
  Faculty->>Controller: POST /course-cycles + JWT
  Controller->>Service: DTO + persisted JWT actor
  Service->>Policy: assertFaculty
  Service->>Workflow: validate deadline
  Service->>Repository: create
  Repository->>PostgreSQL: INSERT DRAFT + owner FK
  PostgreSQL-->>Controller: explicit response DTO
```

## Publish sequence

```mermaid
sequenceDiagram
  actor Faculty
  Faculty->>Controller: POST /course-cycles/:id/publish
  Controller->>Service: actor + id
  Service->>Policy: assertOwner
  Service->>Workflow: DRAFT -> PUBLISHED + publish rules
  Service->>Repository: transitionStatus(id, DRAFT, PUBLISHED)
  Repository->>PostgreSQL: conditional UPDATE WHERE id AND status=DRAFT
  PostgreSQL-->>Controller: 200 response or 409 race
```

Phase 3 added an append-only audit module (`AuditService.record(tx, event)`); cycle changes are not audited yet, and adding it means wrapping the transition in `TransactionRunner.run`.

## State machine

```mermaid
stateDiagram-v2
  [*] --> DRAFT
  DRAFT --> PUBLISHED: publish
  PUBLISHED --> CLOSED: close
```

| State       | Editable fields                     | Actions             |
| ----------- | ----------------------------------- | ------------------- |
| `DRAFT`     | All request fields, including team sizes and the formation deadline | Edit, publish       |
| `PUBLISHED` | `description`, `submissionDeadline`, `teamFormationDeadline` (only while formation is open, only to a future time) | Limited edit, close |
| `CLOSED`    | None                                | None                |

Phase 4 added the team rules `minTeamSize`, `maxTeamSize` and `teamFormationDeadline` (defaults 1,
4 and `submissionStartAt`). `CycleWorkflow.assertValidSchedule` checks them on every save. See
[teams.md](teams.md) and [ADR 009](../decisions/009-team-rules-and-formation-deadline.md).

`CycleWorkflow` owns a declarative transition table and the publish rule list. `status` is never accepted by a DTO and is only changed through `transitionStatus` with an observed status in the database `WHERE` clause.

## Access matrix

Since Phase 3 the global `RolesGuard` checks the role first; the policy then decides per cycle. A cycle the caller may not see is reported as `404 CYCLE_NOT_FOUND`, so its existence is not revealed.

| Actor                 | List                                            | Read                       | Mutate                                |
| --------------------- | ----------------------------------------------- | -------------------------- | ------------------------------------- |
| Faculty owner         | `/my`, all statuses                             | Own cycles                 | Create, edit by state, publish, close |
| Other faculty         | None for another owner                          | `404 CYCLE_NOT_FOUND`      | `404 CYCLE_NOT_FOUND`                 |
| Student with batch    | Published cycles for persisted `User.batchYear` | Published same-batch cycle (else 404) | `403 FORBIDDEN_ROLE`       |
| Student without batch | Empty list                                      | No cycle                   | `403 FORBIDDEN_ROLE`                  |
| Admin                 | Every published or closed cycle                 | Non-draft cycles (drafts 404) | `403 FORBIDDEN_ROLE`               |
| Pending staff         | `403 FACULTY_APPROVAL_PENDING`                  | `403 FACULTY_APPROVAL_PENDING` | `403 FACULTY_APPROVAL_PENDING`    |

Batch filtering occurs in `PrismaCycleRepository.listPublishedForBatch`; email parsing is not repeated.

## Errors

| Code                        | HTTP | Meaning                                |
| --------------------------- | ---: | -------------------------------------- |
| `CYCLE_NOT_FOUND`           |  404 | Unknown id, or a cycle the caller may not see (another owner, another batch, a draft) |
| `NOT_CYCLE_OWNER`           |  403 | Defense in depth: a non-faculty actor reached a faculty-only operation |
| `INVALID_STATUS_TRANSITION` |  409 | Illegal transition or CAS race         |
| `CYCLE_ALREADY_CLOSED`      |  409 | Any closed-cycle mutation              |
| `CYCLE_FIELD_LOCKED`        |  409 | Field is not editable in current state, or the formation deadline has already passed |
| `INVALID_DEADLINE`          |  400 | Start is not before deadline           |
| `INVALID_ACADEMIC_YEAR`     |  400 | Academic year is not consecutive `YYYY-YY` |
| `INVALID_TEAM_SIZE`         |  400 | Team sizes are not `1 <= min <= max <= 10` |
| `INVALID_TEAM_FORMATION_DEADLINE` | 400 | Formation does not end before the submission deadline, or is moved into the past |

## Defaults applied

- Course name and title are required and limited to 120 characters.
- Description is optional and limited to 2000 characters.
- Semester is an integer from 1 through 12.
- Academic year uses consecutive `YYYY-YY` values.
- Closed cycles are hidden from students.
- PostgreSQL `RESTRICT` protects the faculty ownership relation.
- The student list is unpaginated and ordered by newest publication.
- No automatic close, archive, delete, duplicate, or scheduled transition exists.

## Design defense

| Question                                | Answer                                                                                                                    | Code reference                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Why is this its own concept?            | A cycle is the faculty-owned academic boundary shared by later teams, ideas, submissions, and evaluations.                | `schema.prisma: CourseProjectCycle`                                                                 |
| Why can status not be set directly?     | Lifecycle changes need transition rules, timestamps, and compare-and-set protection.                                      | `cycle-workflow.ts: CycleWorkflow`, `cycle-repository.ts: transitionStatus`                         |
| Why store batch in the database?        | The cycle targets a persisted cohort; letting a client choose access would be insecure.                                   | `prisma-cycle.repository.ts: listPublishedForBatch`                                                 |
| Why filter students by batch?           | Students should see only published academic contexts assigned to their persisted batch.                                   | `course-cycle.service.ts: listForStudent`                                                           |
| Why only the owner can modify?          | Ownership keeps faculty changes scoped to the cycle they created.                                                         | `cycle-authorization-policy.ts: assertOwner`                                                        |
| Why a modular monolith?                 | The current domain is small and transactional; modules preserve boundaries without distributed-system cost.               | `course-cycles.module.ts: CourseCyclesModule`                                                       |
| Where are SRP, OCP, DIP, and State?     | Controller maps HTTP, service orchestrates, workflow owns state, and service depends on the repository abstraction.       | `course-cycle.controller.ts`, `course-cycle.service.ts`, `cycle-workflow.ts`, `cycle-repository.ts` |
| Where are transactions used?            | No transaction wraps a single-row CAS update; PostgreSQL atomicity is sufficient. No audit transaction exists yet.        | `prisma-cycle.repository.ts: updateFields/transitionStatus`                                         |
| What happens to another faculty member? | The role guard permits faculty, then the ownership policy reports `CYCLE_NOT_FOUND` with HTTP 404, hiding the cycle.      | `course-cycle.controller.ts`, `cycle-authorization-policy.ts`                                       |
| How would another state be added?       | Add one transition-table entry, editable-field list, and focused workflow tests; service and controller remain unchanged. | `cycle-workflow.ts: transitions/editableFields`                                                     |

## Extension check

- `ARCHIVED`: touches the `CycleStatus` enum, `CycleWorkflow` transition/editability tables, response typing, and focused tests; controller and service orchestration stay unchanged.
- Deadline less than 24 hours away: adds one publish rule in `CycleWorkflow.validatePublishRules`; no controller change.
- Faculty draft duplication: adds a repository `createFromCycle` operation and service orchestration; lifecycle and controller boundaries remain localized.

## Limitations

Swagger is served at `/api/docs` outside production. Cycle changes are not yet audited. Frontend tests remain out of scope; frontend build and lint are the verification gates.
