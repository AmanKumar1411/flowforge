# ADR 021: The student dashboard is a computed read model

**Status:** Accepted (Phase 9). Builds on [ADR 017](017-computed-dashboard-events.md).

## Decision

- `src/dashboard` owns **no tables**. `GET /me/dashboard` composes the other modules through one
  port, `StudentSources`, whose adapter calls their exported services (course-cycles, teams,
  ideas, submissions, evaluations). Their visibility rules apply unchanged.
- **Up next** = things to do (from `StudentTodoRules`) first, soonest deadline first, then dates
  (`CycleTimeline` events); at most 10. `StudentTodoRules` is a strategy registry: a rule is a
  class with `items(context)`; the registry runs all and drops duplicates by key. Leader-only
  actions are returned to members as information (`actionable: false`).
- **Updates** are computed from rows that already exist in the student's own teams: their
  `TeamMember.addedAt`, `IdeaReview`s, the milestone's `releasedAt`, and evaluations changed after
  release; at most 20, newest first. Nothing is stored or kept in sync.
- **Project cards**: summary, stage, next event, my team and role, first to-do, released results.

## No N+1

Each source is one batched read for all the student's teams (`teamId IN (…)`): ideas with
reviews, submitted milestones, released evaluations. `test/dashboard.e2e.ts` counts Prisma query
events for a student with 1 project and with 5, and requires the same number.

## Alternatives

Stored notifications (ADR 017 lists what would justify them); a dashboard table filled by
events (a second source of truth to keep in step with every module).
