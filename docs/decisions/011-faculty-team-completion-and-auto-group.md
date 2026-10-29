# ADR 011: Faculty complete teams in a second window; auto-group is preview-then-confirm

**Status:** Accepted (Phase 5). Amended after Phase 7: a faculty window must have length. A request
that names `teamCompletionDeadline` must put it after `teamFormationDeadline`; `null` (or leaving
it out) means no window, still stored as `D2 = D1`.

**Amended (Phase 8, [ADR 016](016-milestones-replace-the-submission-window.md)):** `teamCompletionDeadline` is gone. The faculty place students (by hand, add a member, auto-group) from the team deadline until the idea deadline (A1).

## Context

Some students always end up without a team. The team decided on two dates: students form their
own teams until the formation deadline (D1); the owning faculty then place everyone still without
a team until the completion deadline (D2). Faculty can build a team by hand, add a student to a
team with room, or auto-group the rest at random, with a preview first.

## Decision

- `teamCompletionDeadline` (D2) with `D1 <= D2`; `D2 = D1` (the default) means no faculty window.
  When D1 moves and D2 equalled it, D2 moves too, so a cycle does not gain a window by accident.
- `TeamRules.isCompletionOpen`: `PUBLISHED` and `D1 <= now < D2`. Students cannot change teams in
  this window; only the owning faculty can, and only to place students (create a team with a chosen
  leader, add a member). Sizes still hold on every save.
- A student without a team can switch on "Looking for a team" (`TeamSeeker`) with a note, so
  leaders can find them before D1. The flag is cleared when they join a team.
- Auto-group is **stateless**: `POST …/auto-group/preview` returns random teams and saves nothing;
  `POST …/auto-group` receives the teams to create and re-checks every one of them like a manual
  team, all in one transaction. If anything changed since the preview, nothing is created.
- `TeamAllocator` uses the fewest teams that fit the size range, with sizes differing by at most
  one, and places as many students as possible; the rest are reported as `unplaced`. Leaders are
  the first member of each shuffled group (Fisher-Yates over an injected `RandomSource`, seeded in
  tests).
- Teams record their `origin` (`STUDENT`, `FACULTY`, `AUTO_GROUP`) and each member who placed them
  (`TeamMember.addedById`).

## Alternatives considered

| Option | Why not |
| --- | --- |
| Store the preview and confirm it by id | State to expire and clean up; re-validating the submitted teams is simpler and just as safe |
| Auto-group runs by itself at D1 | Faculty wanted to see and re-roll the teams first |
| Let faculty exceed the maximum size | Declined in Phase 6; every team stays within the range |
| Faculty may also remove members after D1 | Not needed yet; it would be one more command with the same locks |

## Consequences

- With strict sizes a student can be left unplaced (for example sizes 3 to 3 and 7 students). The
  faculty see them in the list; there is no way to exceed the maximum.
- Students who never sign in were invisible to completion; [ADR 012](012-pre-registered-students.md)
  lets the faculty register them.
