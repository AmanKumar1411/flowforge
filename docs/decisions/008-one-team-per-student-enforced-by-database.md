# ADR 008: The database enforces one team per student per cycle

**Status:** Accepted (Phase 4)

## Context

"A student cannot be in two teams of one cycle" and "a team stays within the cycle's size range"
are the two invariants every later phase relies on: ideas, submissions and evaluations all hang off
a team. Checking them in application code alone has two holes:

1. **Two leaders, one student.** Both requests check, see the student free, and both insert.
2. **Two changes to one team.** The leader saves from two tabs. Each change reads members
   `{A, B}`, adds one student, and passes the size check alone. Together they leave four members
   in a team limited to three.

## Decision

**Schema (migration `20261027120000_teams`):**

- `TeamMember` has `@@unique([cycleId, userId])`. `cycleId` is copied onto the member row
  precisely so this key can exist.
- The member row's `cycleId` cannot drift from its team's. `TeamMember (teamId, cycleId)` is a
  composite foreign key to `Team (id, cycleId)`, a unique pair. Prisma's nested writes also fill
  both columns from the parent team.
- `Team` has `@@unique([cycleId, leaderId])`, and the leader also has a member row.
- `CourseProjectCycle` has a CHECK constraint: `1 <= minTeamSize <= maxTeamSize <= 10`.

**Application:**

- `TeamFormationService` still checks first (eligibility, then membership), to give a clear message
  naming the students. The unique key is what makes the rule hold under concurrency.
  `PrismaTeamRepository` maps a unique violation (`P2002`) to `409 STUDENT_ALREADY_IN_TEAM`, so a
  lost race looks the same as a normal refusal.
- Every change to an existing team starts with `SELECT … FROM "Team" WHERE id = $1 FOR UPDATE`
  (`TeamRepository.findByIdForUpdate`). The team row is the lock for its members: concurrent changes
  to one team run one after another, and the second re-reads the members the first committed
  before checking the size. Disbanding takes the same lock, so a change cannot land on a team that
  is being deleted.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Application checks only | Fails both races above |
| `SERIALIZABLE` isolation for team transactions | Correct, but the caller must retry on serialization failures, and every team request pays for it |
| Optimistic `version` column with compare-and-set | Also correct, but the client must send and refresh a version, and a lost race becomes an error the user must retry. A row lock just waits a few milliseconds. |
| Unique key on `userId` alone | Would forbid a student from being in teams of two different cycles |
| A partial unique index for "one leader per team" | Prisma's schema cannot express it. `leaderId` on `Team` states it directly. |

## Consequences

- The invariants hold even with a bug in the service or a direct SQL session. Integration tests
  prove it: two leaders racing for one student give exactly one `201` and one `409`; two
  concurrent edits leave three members, not four; raw inserts that break either key, or the size
  CHECK, are refused.
- Lock scope is one team row for a few milliseconds. Different teams never wait for each other.
- Team creation does not lock the cycle row. If faculty close the cycle while a team is being
  created, the team may be committed just after the close. The cycle is already published and the
  deadline still applies, so nothing breaks.
