# ADR 007: The leader forms the team directly, without invitations

**Status:** Accepted (Phase 4)

## Context

Students work in teams inside a published course/project cycle. The team decided how a team comes
together:

- The student who creates the team (fills the form) is its **leader**. Leadership is never
  transferred.
- The leader searches batch-mates by name or email and adds them. Added students are members **at
  once**: they do not accept anything and simply see the team the next time they open FlowForge.
- A student is in at most one team per cycle. The search shows who is already taken.
- Until the formation deadline the leader can change the members (see [ADR 009](009-team-rules-and-formation-deadline.md)).

## Decision

- `POST /api/course-cycles/:cycleId/teams` with `{ name, memberIds }` creates the team. The caller
  becomes `leaderId`, and `memberIds` are the *other* members. The leader is stored as a member
  row too, so every uniqueness rule covers them.
- `PATCH /api/teams/:teamId` with `memberIds` **replaces** the other members (a complete list, not
  add/remove calls). `TeamRules.planMembers` turns the list into additions and removals. The
  leader is dropped from the list if present and can never be removed.
- Only the leader may change or disband the team (`TeamAccessPolicy.assertLeader`, `403
  NOT_TEAM_LEADER`). Members cannot leave on their own; they ask their leader.
- `GET /api/course-cycles/:cycleId/team-candidates?q=` returns up to 20 active students of the
  cycle's batch, each marked `AVAILABLE`, `IN_YOUR_TEAM` or `IN_ANOTHER_TEAM`. It works only while
  formation is open, and the query may not contain LIKE wildcards.
- Every change is audited in the same transaction: `TEAM_CREATED`, `TEAM_UPDATED` (added,
  removed, renamed) and `TEAM_DISBANDED` (former members).

## Alternatives considered

| Option | Why not |
| --- | --- |
| Invitations that members accept | The team rejected it: members should not have to act. It also needs an invitation table, expiry and reminders. |
| Join codes | A leaked code lets anyone in and takes the choice away from the leader |
| Faculty assigns every team | Far more faculty work. Left as a possible later "faculty fix-up" feature. |
| Add/remove endpoints per member | More calls and more partial states. One full list is one transaction and one audit row. |
| Transferable leadership | Explicitly ruled out. A fixed leader is also the natural owner of the Phase 5 idea submission. |

## Consequences

- A student can be placed in a team without consent. This is mitigated by the batch-only search,
  the audit trail, the deadline after which nothing changes, and the faculty's view of every team.
  If consent becomes a requirement, an invitation step can sit in front of `TeamFormationService`
  without changing the rules or the schema.
- A leader who leaves the university blocks changes to their team. Admin or faculty fix-ups would
  solve this and are listed as future work.
- The search exposes names and emails of batch-mates. These are university directory data that
  students already see, and only within their own batch while formation is open.
