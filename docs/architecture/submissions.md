# Submissions (Phase 7)

A team hands in its work as links and notes. Any member can submit while submissions are open,
once the team's idea is approved or picked from the faculty's list. Every submission is a new,
unchangeable version; the newest one before the deadline is the team's final work. Decision:
[ADR 015](../decisions/015-versioned-submissions.md).

## Rules

| Rule | Where it is enforced |
| --- | --- |
| Open from `submissionStartAt` until `submissionDeadline`, while the cycle is published | `SubmissionRules.window` with the injected `Clock` (`409 SUBMISSION_NOT_OPEN` / `SUBMISSION_CLOSED`) |
| Only teams with an approved or picked idea | `SubmissionRules.assertCanSubmit` (`409 IDEA_NOT_APPROVED`) |
| Any member submits; members, the owning faculty and admins read | `SubmissionRules.assertCanSubmit`; visibility through `IdeaService.getTeamIdea` |
| Repository URL required; demo and report links optional (http or https, at most 500 characters); notes at most 4000 | `SubmitWorkDto` |
| Versions 1, 2, 3… per team, even when two members save at once | Team row `FOR UPDATE`, then the next number; unique `(teamId, version)`; CHECK `version >= 1` |
| A submission stays in its team's cycle | Composite foreign key `(teamId, cycleId)` → `Team (id, cycleId)` |
| Every version is audited | `SUBMISSION_CREATED` in the same transaction |

## Module structure

```mermaid
flowchart LR
  subgraph submissions
    P[presentation<br/>SubmissionsController (teams/:id/submissions)<br/>CycleSubmissionsController (course-cycles/:id/submissions)]
    A[application<br/>SubmissionService<br/>ports: SubmissionRepository, SubmissionTeams]
    D[domain<br/>SubmissionRules, submission types]
    I[infrastructure<br/>PrismaSubmissionRepository, IdeasSubmissionTeams]
    P --> A --> D
    I -. implements .-> A
  end
  I --> ideas[ideas<br/>IdeaService: team, cycle and idea]
  ideas --> teams[teams] & cycles[course-cycles]
  A --> audit[audit]
```

The module never reads teams, cycles or ideas itself. `IdeasSubmissionTeams` asks `IdeaService`,
which applies the team and cycle visibility rules, so "who may see this team" is decided in one
place.

## Submit sequence

```mermaid
sequenceDiagram
  actor M as Team member
  participant S as SubmissionService
  participant I as IdeaService
  participant DB as PostgreSQL
  M->>S: POST /teams/:id/submissions {repositoryUrl, demoUrl?, reportUrl?, notes?}
  S->>I: getTeamIdea(actor, teamId)
  Note right of I: 404 TEAM_NOT_FOUND if the caller may not see the team
  S->>S: window open? idea approved? caller a member?
  S->>DB: BEGIN
  S->>DB: SELECT … FROM "Team" WHERE id = ? FOR UPDATE
  S->>DB: highest version of the team
  S->>DB: INSERT Submission (version + 1)
  S->>DB: INSERT AuditLog SUBMISSION_CREATED
  S->>DB: COMMIT
  S-->>M: 201 the new version
```

## Access

| Actor | Read a team's versions | Submit | List the cycle's submissions |
| --- | --- | --- | --- |
| Team member (leader included) | yes | yes, while open and with an approved idea | `403` |
| Other students | `404` | `404` | `403` |
| Owning faculty | yes | `403` | yes |
| Other faculty | `404` | `403` | `404` |
| Admin | yes | `403` | yes |

## Design defense

| Question | Answer | Where |
| --- | --- | --- |
| Why links instead of files? | No storage, size limits or download access control to build; teams already host code online. | ADR 015 |
| Why may any member submit? | The team decided; each version records who submitted it. | `submission-rules.ts` |
| Why no "final" flag? | The newest version before the deadline is final by definition, so nothing can disagree. | `submission.service.ts: listForCycle` |
| Why lock the team row? | Two members saving at once would both read version 2 and both write 3; the lock makes the second wait and read 3. | `prisma-submission.repository.ts: lockLatestVersion` |
| Why read teams through the ideas module? | Visibility and the idea's status come from one place. | `ideas-submission-teams.ts` |

## Limitations

- Links can change after the deadline (for example a repository's default branch). Teams should
  link to a release or commit.
- There is no admin screen; admins read submissions through the API.
- Evaluations of submissions are the next phase.
