# ADR 009: Team rules live on the cycle; the formation deadline fixes teams

**Status:** Accepted (Phase 4). Superseded in part by [ADR 013](013-project-ideas.md): ideas have their own
deadline, and formation must now end by the time submissions open. The faculty completion window
is [ADR 011](011-faculty-team-completion-and-auto-group.md).

## Context

Different courses want different team sizes. Teams must stop changing at some point, so ideas,
submissions and evaluations always refer to a stable group. The team decided:

- faculty set a minimum and maximum size **per cycle**;
- the leader can change members **until the team-formation deadline**, and teams are fixed after it;
- the team-formation deadline and the project-idea deadline are **the same moment**. If an idea is
  rejected (Phase 5), the team stays the same and only the idea is revised.

## Decision

- `CourseProjectCycle` gains `minTeamSize` (default 1), `maxTeamSize` (default 4) and
  `teamFormationDeadline`. When omitted, the API sets the deadline to `submissionStartAt`: teams
  must exist when submissions open. The migration backfills existing cycles the same way, so old
  clients keep working unchanged.
- `CycleWorkflow.assertValidSchedule` checks every save:
  - `1 <= min <= max <= 10`, otherwise `INVALID_TEAM_SIZE`;
  - `teamFormationDeadline < submissionDeadline`, otherwise `INVALID_TEAM_FORMATION_DEADLINE`.
  The deadline may fall after submissions open.
- Sizes are editable only in `DRAFT`. Once students can form teams, lowering the maximum would
  break teams that already exist.
- On a `PUBLISHED` cycle the deadline is editable only while formation is still open, and only to a
  future time (`CycleWorkflow.assertTeamDeadlineChange`). Faculty can extend, or bring forward,
  but **never reopen** teams that are already fixed (`409 CYCLE_FIELD_LOCKED`).
- `TeamRules.isFormationOpen`: the cycle is `PUBLISHED` **and** `now < teamFormationDeadline`.
  Exactly at the deadline counts as closed. Closing the cycle also fixes its teams.
- The window is checked on each request against the injected `Clock`. No scheduler or background
  job flips a flag. Reading teams stays possible forever.
- A team always satisfies the size range: every create and every change is checked, and sizes
  cannot change after publication. "Incomplete team" is therefore not a state anyone has to handle.

## Alternatives considered

| Option | Why not |
| --- | --- |
| One global size from configuration | Courses differ; the team chose per-cycle sizes |
| Lock at `submissionStartAt` with no new field | Ideas need their own deadline, and it must equal the formation deadline |
| Faculty press "Lock teams" | Easy to forget; a date is visible to students in advance |
| Lock when the idea is submitted | Considered; the team chose "until the deadline" so a leader can still fix the members after submitting an idea |
| Allow under-minimum teams until the deadline | Every later phase would need to handle incomplete teams |
| A scheduled job that marks teams locked | An extra moving part; computing the window from the clock is exact and testable with a fake clock |

## Consequences

- Students see the rules ("2 to 3 members, leader included", "Teams fixed after …") on the
  cycle page, and the UI hides editing once the deadline passes. The API stays the authority:
  `409 TEAM_FORMATION_CLOSED`.
- Phase 5 reuses `teamFormationDeadline` as the idea deadline, so it adds no new date field. Idea
  revisions after a rejection change only the idea, never the team.
- A cycle created without the new fields gets formation until submissions open. A cycle whose start
  is already in the past has formation closed from the start. Faculty set the deadline explicitly
  when they want teams.
