# Evaluations

Private marks and feedback per team per milestone ([ADR 020](../decisions/020-private-evaluations.md)).

```
backend/src/evaluations/
  domain/          evaluation (types), evaluation-rules, evaluation-policy, evaluation.errors
  application/     evaluation.service, evaluation-commands, evaluation-views,
                   ports/evaluation.repository, ports/grading-sources
  infrastructure/  prisma-evaluation.repository, modules-grading-sources
  presentation/    evaluations.controller, dto/
```

Tables: `MilestoneGrading` (scale, release), `Evaluation` (one per team and milestone; composite
foreign keys keep milestone and team in one cycle), `EvaluationRevision` (append-only history).

## Rules

| Rule | Where |
| --- | --- |
| Grading from the milestone's due date while published; scale until the cycle closes | `EvaluationRules.assertGradingOpen`, `checkMaxMarks` |
| `0 <= marks <= maxMarks`, 2 decimals; marks need a scale; marks or feedback required | `EvaluationRules.clean`; CHECKs |
| Each save is version + 1, based on the version read | `EvaluationRules.nextVersion`; conditional update + unique key |
| Release once, with at least one graded team | `EvaluationRules.assertCanRelease`; conditional update |
| Owner grades, admins read, members read their own team's released result; others 404 | `EvaluationPolicy`; SQL in `listReleasedForMember` |

## API (prefix `/course-cycles/:cycleId/milestones/:milestoneId`)

| Method | Path | Access |
| --- | --- | --- |
| GET | `/grading` | Owner, admin (students and other faculty: 404) |
| PUT | `/grading` `{ maxMarks }` | Owner |
| POST | `/grading/release` | Owner |
| PUT | `/teams/:teamId/evaluation` `{ marks?, feedback?, expectedVersion? }` | Owner |
| GET | `/teams/:teamId/evaluations` | Members (released only; `[]` before), owner, admin |

Writes are FACULTY-only routes: admins and students get the role guard's `403 FORBIDDEN_ROLE`, as
everywhere else; another faculty member gets 404.

## Errors

| Code | HTTP | When |
| --- | ---: | --- |
| `GRADING_NOT_OPEN` | 409 | Before the milestone's due date |
| `GRADING_CLOSED` | 409 | The cycle is not published (or closed, for the scale) |
| `INVALID_MAX_MARKS` | 400 | Not a whole number from 1 to 1000 |
| `MAX_MARKS_BELOW_EXISTING` | 409 | Below a mark already given |
| `MAX_MARKS_NOT_SET` | 409 | Marks before a scale |
| `INVALID_MARKS` | 400 | Outside 0…max, or more than 2 decimals |
| `EMPTY_EVALUATION` | 400 | Neither marks nor feedback |
| `EVALUATION_CHANGED` | 409 | Saved by someone else since it was read |
| `ALREADY_RELEASED`, `NOTHING_TO_RELEASE` | 409 | Release twice, or with no graded team |
| `MILESTONE_NOT_FOUND`, `TEAM_NOT_FOUND` | 404 | Not the cycle's, or hidden |
