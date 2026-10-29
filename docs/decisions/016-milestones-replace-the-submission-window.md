# ADR 016: Milestones replace the single submission window

**Status:** Accepted (Phase 8). Amends ADRs 009, 011, 013 and 015.

## Context

Until Phase 7 a cycle had one schedule: team formation, an optional faculty completion window,
the idea deadline, and one submission window (`submissionStartAt` to `submissionDeadline`).
Real courses check work several times (a design review, a beta, a final presentation), each with
its own dates, links and evaluation day. Faculty also asked for one guided creation flow and for
students to see what comes next.

## Decision

- A cycle has **milestones M1…Mn** (1 to 10 to publish; a draft may have none yet). Each holds a
  name, a description, `submissionOpensAt < submissionDueAt <= evaluationAt`, and a link
  requirement ([ADR 018](018-configurable-link-requirements.md)). Milestone n opens at or after
  milestone n−1 is due; M1 opens at or after the idea deadline.
- The schedule is now `teamDeadline < ideaDeadline <= M1.opens < M1.due <= …`. The faculty's
  separate completion window is gone: **they place students from the team deadline until the
  idea deadline** (A1), so the two deadlines may not be equal.
- **Milestones belong to the cycle aggregate.** `PrismaCycleRepository` loads them with the
  cycle and saves the cycle and its milestones in one transaction under the cycle's row lock.
  `MilestoneSchedule` (pure) holds every ordering rule; the database checks each milestone's own
  order.
- **Submissions reference a milestone** through a composite foreign key `(milestoneId, cycleId)`,
  next to the existing `(teamId, cycleId)`, so a version can only belong to a milestone of the
  team's own cycle. Versions are numbered per `(team, milestone)`, under the team's row lock.
- After publishing (A3): milestones cannot be added, removed or reordered (`409
  MILESTONES_LOCKED`); a milestone that has not opened may move its dates and change its
  description, only to the future; an opened one is fixed (`409 MILESTONE_LOCKED`). Ids stay
  stable across edits because submissions reference them.
- A milestone stores dates and details only (A2). A later `Evaluation` can reference
  `Milestone(id, cycleId)` without changing it.

## Why one aggregate

The schedule is one invariant across the cycle's deadlines and every milestone. Saving them
separately would let a request leave the cycle half-updated (a new idea deadline with old
milestones), and every other module would have to load milestones itself. Keeping them in the
aggregate means one lock, one transaction, one place for the rules, and one read for teams,
ideas and submissions.

## Alternatives considered

- **Keep one window and add "stages" as labels:** no per-stage dates, links or evaluations;
  versions would mix work for different checkpoints.
- **Milestones as their own module:** cleaner reuse, but the ordering invariant spans the cycle,
  so the two modules would need a distributed lock or a saga for every edit.
- **Copy a milestone's dates into each submission:** a moved due date would not move with them,
  and the window check would read stale data.

## Consequences

- One migration renames `teamFormationDeadline` to `teamDeadline`, drops the completion and
  submission columns, and keeps existing data: each cycle gets one "Final submission" milestone
  from its old window.
- Routes for submissions now carry the milestone: `/teams/:id/milestones/:milestoneId/submissions`.
