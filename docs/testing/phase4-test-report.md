# Phase 4 test report: teams

**Date:** 2026-10-27 · **Branch:** `phase4-teams` (from `96f76eb`) · **Environment:** macOS,
Node 22.14, PostgreSQL in Docker (`flowforge_test`), headless Google Chrome

## Result

**All 521 tests and checks pass. Every Phase 2 and Phase 3 test still passes. All quality gates
pass, and `npm audit` reports 0 vulnerabilities in both apps.**

| Layer | Runner | What it exercises | Passed | Time |
| --- | --- | --- | ---: | ---: |
| Unit | Jest | Domain rules, policies, services with in-memory doubles | **234 / 234** (159 before) | 1.8 s |
| Integration | `node:test` + real PostgreSQL | Full HTTP API through the real Nest app | **256 / 256** (190 before) | 20.4 s |
| Browser end-to-end | Chrome via `playwright-core` | Real React app against the real API | **31 / 31** (20 auth + 11 teams) | 13.5 s |
| **Total** | | | **521 / 521** | |

| Gate | Result |
| --- | --- |
| Backend `build`, `typecheck` (incl. tests), `lint` | Pass |
| `prisma validate`; `prisma migrate status` (4 migrations, dev and test databases) | Valid, up to date |
| Migration drift (`prisma migrate diff` database → schema) | Empty |
| Frontend `build`, `lint` | Pass |
| `npm audit` (backend and frontend) | 0 vulnerabilities |

## Requirement traceability

| Requirement (agreed with the team) | Covered by | Result |
| --- | --- | --- |
| Faculty set minimum and maximum team size per cycle; defaults 1 to 4; `1 <= min <= max <= 10` | `cycle-workflow.spec.ts`; `course-cycle.service.spec.ts`; Integration: cycle team rules; DB CHECK (Integration: database guarantees) | Pass |
| Sizes are fixed once the cycle is published | `course-cycle.service.spec.ts`; Integration; Browser check 2 (inputs disabled) | Pass |
| Formation deadline: before the submission deadline; extendable while open; never reopened once passed; never moved into the past | `cycle-workflow.spec.ts` (3); `course-cycle.service.spec.ts` (2); Integration (2); Browser check 2 | Pass |
| The student who creates the team is its leader; leadership is never transferred | `team-rules.spec.ts` (planMembers); `team.services.spec.ts`; Integration: changing a team | Pass |
| Leader searches batch-mates by name or email; results show who is free, in your team or taken | `team.services.spec.ts` (3); Integration: searching (2); Browser checks 5 and 7 | Pass |
| Added students are members at once, with no acceptance step, and see the team | `team.services.spec.ts`; Integration: forming a team; Browser check 6 | Pass |
| A student can never be in two teams of one cycle, even when two leaders race | `team-rules.spec.ts`; `team.services.spec.ts`; Integration: two leaders racing → one `201`, one `409`, one membership row | Pass |
| Team size (leader included) holds on every save, even with concurrent edits | `team-rules.spec.ts`; Integration: concurrent edits → 3 members, not 4 (row lock) | Pass |
| Only active students of the cycle's batch can join (not other batches, staff, deactivated or unknown ids) | `team-rules.spec.ts` (7); `team.services.spec.ts` (4); Integration | Pass |
| Only the leader changes or disbands the team; members `403`, outsiders `404` | `team-access.policy.spec.ts`; `team.services.spec.ts`; Integration; Browser check 6 | Pass |
| Leader can change members until the deadline; removed students lose access, added ones gain it | `team.services.spec.ts`; Integration; Browser check 8 | Pass |
| After the deadline (or when the cycle closes) nothing changes: create, edit, disband and search all `409`; reading still works | `team-rules.spec.ts`; `team.services.spec.ts` (2); Integration (2); Browser check 11 | Pass |
| Visibility: students see their own team; the owning faculty and admins see all; other faculty and other batches get `404`; pending staff `403` | `team-access.policy.spec.ts`; Integration: who sees which team; RBAC matrix (49 new cases) | Pass |
| Every team change is audited in the same transaction | `team.services.spec.ts`; Integration (TEAM_CREATED, TEAM_UPDATED, TEAM_DISBANDED) | Pass |
| A member row cannot point at a different cycle from its team | Integration: database guarantees (composite foreign key) | Pass |
| Search input cannot inject LIKE wildcards; queries under 2 characters are rejected | Integration: searching | Pass |
| Existing cycles keep working after the migration (backfilled deadline, defaults) | Phase 2 tests unchanged; migration applied to dev and test databases | Pass |

## Unit tests (Jest)

| Suite | Passed | New in Phase 4 |
| --- | ---: | --- |
| `src/teams/application/team.services.spec.ts` | 25/25 | New: formation and query services on the real `CourseCycleService` with in-memory repositories |
| `src/teams/domain/team-rules.spec.ts` | 25/25 | New |
| `src/teams/domain/team-access.policy.spec.ts` | 10/10 | New |
| `src/course-cycles/domain/cycle-workflow.spec.ts` | 19/19 | +11 (team sizes, formation deadline) |
| `src/course-cycles/course-cycle.service.spec.ts` | 11/11 | +4 (defaults, validation, publish locks, no reopening) |
| `src/auth/infrastructure/rishihood-identity-parser.spec.ts` | 48/48 | |
| `src/config/env.validation.spec.ts` | 34/34 | |
| `src/auth/domain/role-resolver.spec.ts` | 26/26 | |
| `src/auth/application/session.service.spec.ts` | 11/11 | |
| `src/auth/domain/batch-year.policy.spec.ts` | 10/10 | |
| `src/auth/infrastructure/google-identity.provider.spec.ts` | 7/7 | |
| `src/auth/infrastructure/google-oauth.client.spec.ts` | 5/5 | |
| `src/auth/infrastructure/dev-identity.provider.spec.ts` | 3/3 | |

## Integration tests (`npm run test:integration`)

| Suite | Passed | Note |
| --- | ---: | --- |
| RBAC matrix | 175/175 | +49: seven team routes × seven actors |
| Teams | 17/17 | New: rules, forming, races, search, changes, lock, deadline, visibility, DB constraints |
| Google Sign-In | 13/13 | |
| Sessions | 13/13 | |
| Faculty access | 10/10 | |
| Login eligibility | 8/8 | |
| Boot-time configuration | 6/6 | |
| User administration | 5/5 | |
| Rate limiting on /api/auth | 4/4 | |
| Course cycles (Phase 2 scenario) | 3/3 | |
| Dev login switched off | 2/2 | |

The Teams suite drives the formation window with an injected `FixedClock`, so "after the
deadline" is tested exactly, without waiting.

## Browser end-to-end checks

`auth-ui.e2e.cjs` (Phase 3): **20/20**, unchanged; see the
[Phase 3 report](phase3-test-report.md#browser-end-to-end-checks-e2ebrowser).

`teams-ui.e2e.cjs` (Phase 4):

| # | Check | Result |
| ---: | --- | --- |
| 1 | Faculty sets team rules in the cycle editor and publishes the cycle | Pass |
| 2 | Faculty extends the formation deadline of the published cycle; team sizes are locked | Pass |
| 3 | Student sees the team rules and an invitation to create a team | Pass |
| 4 | "Create team" stays disabled while the team is below the minimum size | Pass |
| 5 | Leader finds a batch-mate by name, adds them, and creates the team | Pass |
| 6 | The added member sees the team at once, without accepting anything, and cannot edit it | Pass |
| 7 | Another leader's search shows that student as already in a team | Pass |
| 8 | Leader swaps a member before the deadline; the removed student loses the team | Pass |
| 9 | Faculty sees every team of the cycle with its leader and members | Pass |
| 10 | Leader disbands the team after confirming; every member is free again | Pass |
| 11 | After the formation deadline the team is shown as fixed, with no way to change it (UI read-only; API `409 TEAM_FORMATION_CLOSED`) | Pass |

Screens were also checked by eye at desktop and phone widths: the editor with its live size
counter, and a fixed team on a 390 px screen.

## Defects found and fixed

| # | Found by | Defect | Fix |
| --- | --- | --- | --- |
| 1 | Analysis, confirmed by browser check 2 | **Editing a published cycle from the UI always failed** (since Phase 2). The editor sent every field, and the API rejects any locked field in the request, even unchanged, with `409 CYCLE_FIELD_LOCKED`. | `CycleEditorPage` sends only the fields that changed since it loaded the cycle |
| 2 | Analysis | The RBAC matrix cycle used fixed dates. With the new default (formation until submissions open), team routes would have been tested against a closed window. | Matrix cycle dates are relative to now |
| 3 | Frontend lint (React compiler rules) | `Date.now()` called during render to decide whether formation is open | The time is read once per mount (`useState(() => Date.now())`) and passed in explicitly |

Three test bugs were also corrected during the round, none of them product defects:

- Two assertions read `/teams/mine` across all cycles while users outlive each test. They now filter
  by the test's cycle.
- Two places in the test response type lacked the error fields.

## Not covered and known limitations

- Members cannot leave a team on their own, and faculty cannot edit teams (future work, ADR 007).
- A deactivated student stays in their team and counts toward its size.
- An admin batch correction does not move a student out of an existing team.
- Admins read teams through the API only; the admin console has no team screen yet.
- Frontend components have no unit tests; their behaviour is covered by the browser checks.

## How to reproduce

```bash
cd backend && npm test                      # unit
cd backend && npm run test:integration      # needs Docker running and the flowforge_test database
# browser checks: see e2e/browser/README.md (run auth-ui first, then teams-ui)
```
