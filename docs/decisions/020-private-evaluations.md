# ADR 020: Private evaluations per milestone, released all at once

**Status:** Accepted (Phase 9)

**Note:** Phase 10: marks and the scale are off unless `EVALUATION_MARKS_ENABLED` is on; grading is feedback only ([ADR 025](025-feedback-only-evaluations.md)).

## Context

Teams submit versioned work per milestone (ADRs 015, 016). The faculty now mark it and give
feedback, and only the team may see its own result.

## Decision

- **One evaluation per team per milestone (S1):** optional marks out of the milestone's
  `maxMarks` (S3; 1–1000, set before any mark) and/or feedback. A per-member mark would be a child
  record of `Evaluation` later; nothing here changes for it.
- **Release per milestone, for all teams at once, one-way (S2).** Results are hidden until then.
  A team graded after release sees its result at once; a correction after release is a new
  version and shows as "Updated" (`updatedAt > releasedAt`).
- **Grading window:** from the milestone's `submissionDueAt` while the cycle is published; the
  scale can be set any time before the cycle closes, never below an existing mark
  (`409 MAX_MARKS_BELOW_EXISTING`). Teams without a submission can be graded (flagged in the UI).
- **History:** every save writes an `EvaluationRevision` (append-only, enforced by a trigger) and
  bumps `version`; audit rows `EVALUATION_SAVED`, `EVALUATION_RELEASED`, `GRADING_SCALE_SET` are
  written in the same transaction.
- **Privacy in three layers:** `EvaluationPolicy` (owner grades, admins read, members read their
  own team); the student query filters *released* and *the caller's team membership* in SQL
  (`listReleasedForMember`); anything hidden or foreign is **404**, never 403. A member before
  release gets `200 []`.

## Why release per milestone, not per team

Results are comparable only when everyone gets them together; per-team release leaks timing
("they got theirs, we did not") and invites faculty mistakes. One switch per milestone is also one
audit row to explain.

## Why 404 and not 403

403 says "this exists, but not for you", which leaks that another team has a result. 404 is what
a guessed id gets whether or not it exists.

## Optimistic concurrency, not row locks, for saves

Grading is interactive: two tabs, or two TAs, may edit the same team. A save carries the version
it was based on (`expectedVersion`); the update is conditional on that version, and two first
saves race on the `(milestoneId, teamId)` unique key. Either loser gets `409 EVALUATION_CHANGED`
and reloads, so no change is silently overwritten. A row lock would only serialise the writes and
still let the second overwrite the first. Row locks are used where they fit: the milestone's
grading row is locked `FOR UPDATE` for scale changes and release and `FOR SHARE` during saves, so
the scale cannot change under a save.
