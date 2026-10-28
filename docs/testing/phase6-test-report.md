# Phase 6 test report: project ideas and pre-registered students

**Date:** 2026-10-28 · **Branch:** `phase6-ideas` (from `9313b6b`, uncommitted) · **Environment:**
macOS, Node 22.14, PostgreSQL in Docker (`flowforge_test`), headless Google Chrome

## Result

**All 806 tests and checks pass. Every earlier test still passes, after the changes listed under
[Tests changed by new behaviour](#tests-changed-by-new-behaviour). All quality gates pass, and
`npm audit` reports 0 vulnerabilities in both apps.**

| Layer | Runner | What it exercises | Passed | Time |
| --- | --- | --- | ---: | ---: |
| Unit | Jest | Domain rules, policies, services with in-memory doubles | **337 / 337** (296 in Phase 5) | 1.9 s |
| Integration | `node:test` + real PostgreSQL | Full HTTP API through the real Nest app | **418 / 418** (359 in Phase 5) | 28 s |
| Browser end-to-end | Chrome via `playwright-core` | Real React app against the real API | **51 / 51** (20 sign-in, 11 teams, 11 completion, 9 ideas) | about 2 min, with a 45 s deadline wait |
| **Total** | | | **806 / 806** | |

| Gate | Result |
| --- | --- |
| Backend `build`, `typecheck` (including tests), `lint` | Pass |
| `prisma validate`; `prisma migrate status` (6 migrations, dev and test databases) | Valid, up to date |
| Migration drift (`prisma migrate diff` from the database to the schema) | Empty |
| Frontend `build`, `lint` | Pass |
| `npm audit` (backend and frontend) | 0 vulnerabilities |

## Requirement traceability

| Requirement (agreed with the team) | Covered by | Result |
| --- | --- | --- |
| Ideas have their own deadline after team completion and no later than "Submissions open"; it defaults to the completion deadline | `cycle-workflow.spec.ts` (stage deadlines); `course-cycle.service.spec.ts`; Integration: the idea deadline (2); DB CHECK; Browser ideas check 1 | Pass |
| Teams therefore settle before submissions open; a stage deadline moves only while open; later stages that ended together move with it | `cycle-workflow.spec.ts`; `course-cycle.service.spec.ts`; Integration; Browser ideas check 1 (editor) | Pass |
| The leader submits the idea; members read it; other students cannot see it | `idea-rules.spec.ts`; `idea.service.spec.ts`; Integration: submitting; RBAC matrix; Browser ideas checks 4–5 | Pass |
| The leader can change a waiting idea until the idea deadline; every change is a new version | `idea-rules.spec.ts`; `idea.service.spec.ts`; Integration; Browser ideas check 6 | Pass |
| Teams the faculty create late still have time to submit | Integration: faculty-made teams | Pass |
| The owning faculty approve or reject; a rejection needs feedback; a review names the version read, and a newer one is refused | `idea-rules.spec.ts`; `idea.service.spec.ts`; Integration: reviewing (2); DB CHECK; Browser ideas checks 7 and 9 | Pass |
| A rejected idea can be resubmitted until submissions open, then not; an approved idea is final | `idea-rules.spec.ts`; `idea.service.spec.ts`; Integration (2); Browser ideas checks 8–9 | Pass |
| An idea never changes the team; disbanding a team (before formation ends) removes its idea | Integration: resubmission keeps both members; disband test | Pass |
| Other faculty get `404`; admins read but cannot review; closing the cycle stops reviews and submissions | `idea-rules.spec.ts`; Integration: reviewing; RBAC matrix (42 new cases) | Pass |
| One idea per team, enforced by the database; every idea action is audited | Integration: database guarantees; audit trail test | Pass |
| Faculty import a core batch's list; students of other batches, staff and unknown rows are reported in the order pasted | `student-pre-registration.spec.ts`; Integration: core batch lists; Browser ideas check 2 | Pass |
| Elective enrollment registers students who have not signed in, so they can be placed | `team-completion.service.spec.ts`; Integration: electives | Pass |
| Registered students are found by leaders (tagged "not signed in yet") and placed in teams | Integration: core batch lists; Browser ideas check 3 | Pass |
| The first sign-in (Google or dev) claims the registered account and keeps its id and team; a second Google account for the same email is still a conflict; a deactivated account is not claimed | Integration: Google Sign-In (2), electives; Browser ideas check 5 | Pass |

## Bugs found and fixed during the phase

| # | Where | Bug | Fix |
| --- | --- | --- | --- |
| 1 | Batch import | Refused rows came back grouped by reason, not in the order the faculty pasted them. | Sorted by their position in the pasted list. |
| 2 | Faculty review panel | A failed review (for example `IDEA_CHANGED`) reloaded the list and the message disappeared with the panel. | Result messages live in the section, above the table. |
| 3 | Cycle editor | A new cycle starts with every stage date at "now"; setting only the formation date left the idea deadline before it. | The form moves later stage dates that equalled an earlier one, as the API does. |
| 4 | Demo seed | A demo email that a faculty import had registered (no sub yet) was skipped as "signed in with Google". | Only an account with a different sub is skipped; an unclaimed one is claimed at the next dev login. |

## Tests changed by new behaviour

| Test | Why it changed |
| --- | --- |
| `cycle-workflow.spec.ts` fixtures and the "formation may end after submissions open" case | Stages must now end by the time submissions open. |
| `course-cycle.service.spec.ts`: moving an open formation deadline | Its cycle now opens submissions later than the extended deadline. |
| Integration and unit "enrollment lists who has not signed in" | Such students now get an account (`signedIn: false`) instead of `userId: null`. |
| Browser `auth-ui`: creating a cycle | Fixed dates in October became the past; it now uses dates relative to today. |
| Browser `teams-ui` check 9 and `completion-ui` checks 8 and 10 | The faculty's page now also has an ideas table listing the same team names; the lookups are scoped to the teams table. |
| Browser `completion-ui`: the elective's newcomer | Enrolling now registers them, which put a fourth student into batch 2024; they moved to batch 2022. |

## Not covered yet

- Admins have no cycle page in the UI; their read-only access to ideas is tested through the API only.
- The race between removing a student from an elective and adding them to a team (both by the same
  faculty member) is still possible, as noted in the Phase 5 report.

## How to run

- Unit and integration: in `backend/`, `npm test` and `npm run test:integration`.
- Browser: see the [e2e README](../../e2e/browser/README.md); run the four scripts in order on an
  empty `flowforge_test`.
