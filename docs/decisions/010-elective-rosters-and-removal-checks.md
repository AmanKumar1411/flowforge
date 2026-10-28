# ADR 010: Electives have an enrollment list; other modules veto removals through a registry

**Status:** Accepted (Phase 5). Amended by [ADR 012](012-pre-registered-students.md): an
enrollment now also registers students who have not signed in yet.

## Context

Core courses involve a whole batch, but electives are taken by students from any batch. The
team decided that the faculty enroll elective students themselves, by pasting emails or uploading
a CSV, and that only enrolled students see the elective and can be in its teams.

## Decision

- `CourseProjectCycle.kind` is `CORE` (default) or `ELECTIVE`. It is editable only in `DRAFT`.
- `CycleEnrollment (cycleId, email)` stores an elective's list by **email**, so students can be
  enrolled before their first sign-in. Emails are normalized and checked against the student
  email rules; staff and unknown emails are reported per row, never fatal.
- `CycleRoster` is the single answer to "who takes part": `wholeBatch(batchYear)` for a core
  course, `enrolled(emails)` for an elective. Visibility (`CycleAuthorizationPolicy.canRead`),
  team eligibility and team search all ask the roster, so the two kinds share every team rule.
- Removing a student from an elective must not leave a team with a member who no longer takes
  part. The course-cycles module exposes an extension point, `EnrollmentRemovalChecks`; the teams
  module registers a check in `onModuleInit` that refuses with `409 ENROLLED_STUDENT_IN_TEAM`.
  The cycles module never imports the teams module.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Students join an elective with a code | The team chose faculty-managed lists; a code can be shared |
| Enrollment by user id | Students who have not signed in have no id |
| Cycles module calls the teams repository directly | A dependency cycle between modules; the registry keeps cycles unaware of teams |
| Remove the student from their team automatically | Silently changes a team, possibly below its minimum size |

## Consequences

- A student in an elective team stays enrolled until the team changes (before the formation
  deadline) or the faculty decide otherwise.
- Later modules that hang data off a student in a cycle (ideas, submissions) can register their
  own removal checks the same way.
