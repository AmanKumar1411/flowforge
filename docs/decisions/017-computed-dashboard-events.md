# ADR 017: Upcoming events are computed, not stored

**Status:** Accepted (Phase 8)

## Context

Students should see what comes next (the team deadline, the idea deadline, each milestone's
opening, due date and evaluation) and faculty where a project is. These are notifications in
spirit, but email is out of scope.

## Decision

- `CycleTimeline` (pure, uses the injected `Clock`) computes a cycle's `currentStage`
  (`DRAFT | TEAMS | IDEAS | MILESTONE(position, UPCOMING | OPEN | AWAITING_EVALUATION) | WRAP_UP
  | CLOSED`) and its upcoming events from the dates alone.
- Every cycle response carries `currentStage` and its next three events. `GET /me/upcoming`
  returns the events of the student's visible cycles only, soonest first, at most 10.
- An event at exactly "now" has already happened, because every window closes at its deadline.
  At the same moment, what closes comes before what opens. An open milestone wins over one still
  waiting for its evaluation.
- There is no notification table.

## Why

Computed events are always right: a moved deadline moves its event, a closed cycle has none, and
nothing has to be kept in sync, backfilled or cleaned up. The cost is one pass over a few dates
per cycle on read, which is negligible at this size.

## What would justify stored notifications later

- Delivery outside the app (email, push), which needs "sent" state and retries.
- Read/unread state per student.
- Events that dates cannot derive (a faculty announcement, a review decision).
- A volume where computing on read becomes measurable.
Then events would be written by the changes that cause them, inside their transactions, next to
the audit rows.
