# ADR 019: Publish checks are a registry other modules plug into

**Status:** Accepted (Phase 8)

## Context

Publishing used to re-run the schedule rules only. Phase 8 adds rules that belong to other
modules (a list-only idea source needs ideas in the list) and rules the faculty should hear about
all at once rather than one error per attempt.

## Decision

- `PublishChecks` in course-cycles is an extension point like `EnrollmentRemovalChecks`
  ([ADR 010](010-elective-rosters-and-removal-checks.md)): modules register checks in
  `onModuleInit`, and course-cycles never imports them.
- A check returns findings `{ code, message, severity }`. `BLOCKING` stops the publish; a
  `WARNING` comes back with the published cycle.
- Publishing runs **every** check inside the publish transaction and fails with `409
  PUBLISH_BLOCKED`, listing all blocking findings in `details: [{ code, message }]`.
  `GET /course-cycles/:id/publish-checks` runs the same checks without publishing, for the
  wizard's review step.
- Registered today:
  - course-cycles: the schedule and team sizes, at least one milestone (`NO_MILESTONES`);
    an elective needs enrolled students (`ROSTER_EMPTY`); a core course with no student of its
    batch yet is a warning (`NO_STUDENTS_YET`);
  - ideas: `ideaSource = FACULTY_LIST` with an empty list (`IDEA_LIST_EMPTY`).

## Why

The rule "an idea list is not empty" lives with ideas; putting it in course-cycles would make
course-cycles depend on ideas, which already depends on course-cycles. A registry inverts that
dependency, and the review step can show every problem with a link to the step that fixes it.

## Consequences

- `DomainError` gained an optional `details` list; the error filter adds it to the response body
  only when present, so every other error keeps the `{ code, message }` shape.
- A new rule (for example a deadline less than a day away) is one registered function.
