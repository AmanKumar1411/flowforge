# Phase 4 baseline: teams

Snapshot of the repository before Phase 4 (teams inside course/project cycles) starts.
Commit analysed: `96f76eb` on `phase3-auth-rbac`; Phase 4 work is on branch `phase4-teams`.

## 1. Baseline results

The baseline is the final Phase 3 run recorded in the [Phase 3 test report](../testing/phase3-test-report.md)
for this commit. It was not re-run separately before the first Phase 4 change.

| Check | Result |
| --- | --- |
| `git status` | Clean |
| Backend unit (Jest) | 159 / 159 |
| Backend integration (`node:test`, PostgreSQL) | 190 / 190 |
| Browser end-to-end (auth UI) | 20 / 20 |
| `prisma migrate status` | 3 migrations, up to date |
| `npm audit` | 0 vulnerabilities in both apps |

## 2. What the phase asks for

The README's roadmap names teams as the next concern after cycles ("teams, ideas, submissions and
evaluations come later"). The rules were settled with the team before design:

| Question | Decision |
| --- | --- |
| How do teams form? | The student who creates the team (fills the form) is its leader. They search batch-mates by name or email and add them. Added students are members at once, with no acceptance step. |
| Leadership | Given to the creator and never transferred |
| One student, several teams? | Not allowed within a cycle; the search shows "already in a team" |
| Team size | Minimum and maximum set by faculty per cycle |
| When do teams stop changing? | Members can change until the team-formation deadline; after it the team is fixed |
| Relation to ideas | The formation deadline **is** the idea-submission deadline. A rejected idea is revised; the team stays the same. Ideas are Phase 5. |

## 3. Current structure that the phase builds on

- **Cycles (Phase 2):** `CourseProjectCycle` with `DRAFT → PUBLISHED → CLOSED`, `CycleWorkflow`
  (transition and editable-field tables), `CycleAuthorizationPolicy` (404 for cycles the caller may
  not see), and `CourseCycleService`, which is exported by its module.
- **Auth (Phase 3):** global `JwtAuthGuard` and `RolesGuard`, `@Roles(...)`, `@CurrentUser()` giving
  `{ id, role, batchYear }` loaded from the database on every request. Students have a persisted
  `batchYear`.
- **Cross-cutting:** `TransactionRunner` with an opaque `Transaction`; `AuditService.record(tx, …)`
  on an append-only table; `DomainError` plus a type-checked code→status map; `Clock` port with a
  `FixedClock` for tests.
- **Users:** `UsersService` is the only entry to the `User` table. It had no "find many" or search.
- **Frontend:** the student cycle list and detail page, the faculty list, detail and editor. The
  in-memory access token and single-flight refresh need no change.

## 4. Keep, change, add

| Area | Decision |
| --- | --- |
| Cycle lifecycle and its tests | Keep. Team rules are new fields with defaults, so every existing request and test still works. |
| `CycleWorkflow` | Change: add team fields to the editable-field table, `assertValidSchedule`, and `assertTeamDeadlineChange` |
| `CourseCycleService` | Change: expose `getVisibleCycle` and `getById` for modules that build on cycles |
| `UsersService` | Add `findByIds` and `searchActiveStudents` |
| Audit | Add `TEAM_CREATED`, `TEAM_UPDATED`, `TEAM_DISBANDED` and entity type `Team`; allow string arrays in metadata |
| New `teams` module | Domain (rules, policy), application (two services, three ports), infrastructure (Prisma repository, two adapters), presentation (two controllers) |
| Cycle editor (frontend) | Change: team fields, and send only the fields that changed (see section 5) |

## 5. Problems found during analysis

1. **Editing a published cycle from the UI always failed.** `CycleEditorPage` sent every field.
   The API rejects any locked field present in the request, even unchanged, with `409
   CYCLE_FIELD_LOCKED`. The Phase 2 and 3 tests never edited a published cycle through the UI, so
   it went unnoticed. It matters now because extending the formation deadline is a published-cycle
   edit. **Fixed:** the editor sends only the fields that differ from what it loaded. The new
   browser check 2 covers it.
2. **The integration RBAC matrix used fixed 2026 dates.** With the new default (formation until
   submissions open), formation in the matrix cycle would already be closed. **Fixed:** the matrix
   cycle uses dates relative to now.
3. **The audit metadata type allowed only scalars**, while team events need lists of user ids.
   Widened to `string | number | boolean | null | readonly string[]`; the secret-key guard is
   unchanged.

## 6. Risks for this phase

| Risk | Mitigation |
| --- | --- |
| Two leaders add the same student at the same moment | `TeamMember @@unique([cycleId, userId])`; the repository maps the violation to `409 STUDENT_ALREADY_IN_TEAM` (ADR 008) |
| Two edits of one team together exceed the maximum size | Row lock on the team (`SELECT … FOR UPDATE`) before reading members (ADR 008) |
| A member row pointing at another cycle than its team | Composite FK `(teamId, cycleId)` → `Team (id, cycleId)` |
| Changing sizes after teams exist | Sizes editable in `DRAFT` only |
| Reopening fixed teams by moving the deadline | The deadline can move only while formation is open, and only into the future |
| Existing cycles get a NOT NULL deadline | Migration adds the column nullable, backfills `submissionStartAt`, then sets NOT NULL |
| Search used to browse the student directory | Own batch only, active students only, 20 results, only while formation is open, no LIKE wildcards |
| Students being added without consent | Accepted by the team (ADR 007). Batch-only search, audit trail and faculty visibility limit misuse. |

## 7. Design decisions taken during analysis

- `memberIds` in requests are the **other** members; the caller is the leader. On `PATCH` the list
  replaces the members, so one request is one transaction and one audit row.
- A saved team is always within the size range. There is no "incomplete" state.
- Members cannot leave on their own, and faculty cannot edit teams in this phase (both listed as
  future work).
- Students list only their own team; the owning faculty and admins list all teams. Reading anyone
  else's team returns 404, consistent with Phase 3.
