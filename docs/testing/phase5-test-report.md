# Phase 5 test report: team completion, electives and demo accounts

**Date:** 2026-10-27 · **Branch:** `phase5-team-completion` (`b64446c` plus the uncommitted demo
accounts and the fixes below) · **Environment:** macOS, Node 22.14, PostgreSQL in Docker
(`flowforge_test`), headless Google Chrome

## Result

**All 714 tests and checks pass. Every Phase 2 to 4 test still passes. All quality gates pass,
and `npm audit` reports 0 vulnerabilities in both apps.** This round of testing found three bugs
in the app and two in the browser tests; all five are fixed (see [Bugs found](#bugs-found-and-fixed)).
It also found three places where the flow does not yet do everything we aimed for; they need a
decision, not a fix (see [Flow review](#flow-review)).

| Layer | Runner | What it exercises | Passed | Time |
| --- | --- | --- | ---: | ---: |
| Unit | Jest | Domain rules, policies, services with in-memory doubles | **296 / 296** (234 in Phase 4) | 1.9 s |
| Integration | `node:test` + real PostgreSQL | Full HTTP API through the real Nest app | **359 / 359** (256 in Phase 4) | 25 s |
| Browser end-to-end | Chrome via `playwright-core` | Real React app against the real API | **42 / 42** (20 sign-in, 11 teams, 11 completion) | 18 s + a 45 s deadline wait |
| Flow journey | Node + `playwright-core` request API | One API run through every agreed team rule, in order | **17 / 17** | 26 s (25 s deadline wait) |
| **Total** | | | **714 / 714** | |

| Gate | Result |
| --- | --- |
| Backend `build`, `typecheck` (including tests), `lint` | Pass |
| `prisma validate`; `prisma migrate status` (5 migrations, dev and test databases) | Valid, up to date |
| Migration drift (`prisma migrate diff` from the database to the schema) | Empty |
| Frontend `build`, `lint` | Pass |
| `npm audit` (backend and frontend) | 0 vulnerabilities |

## Requirement traceability

| Requirement (agreed with the team) | Covered by | Result |
| --- | --- | --- |
| Two dates: students form teams until the formation deadline (D1); the owning faculty complete teams until the completion deadline (D2) | `team-rules.spec.ts`; `cycle-workflow.spec.ts`; Integration: the two team deadlines, faculty completing teams; Journey checks 6–7 | Pass |
| D1 ≤ D2 < submission deadline; D2 defaults to D1 and follows it while there is no faculty window; a passed deadline never moves | `cycle-workflow.spec.ts`; `course-cycle.service.spec.ts`; Integration; Journey check 14; DB CHECK constraint | Pass |
| After D1, students can no longer create, change or disband teams, or switch "looking for a team" | Integration; Browser completion check 6, teams check 11; Journey check 7 | Pass |
| A student without a team can mark "looking for a team" with a note; leaders see it in the editor; it clears when they join a team | `team.services.spec.ts`; Integration: looking for a team; Browser completion check 5; Journey checks 5 and 13 | Pass |
| Faculty see every student without a team, with the "looking" flag and note | `team-completion.service.spec.ts`; Integration; Browser completion check 7; Journey check 8 | Pass |
| Faculty build a team from chosen students and pick its leader; they add a student to a team with room; sizes always hold | `team-completion.service.spec.ts`; Integration; Browser completion checks 8–9; Journey checks 10–11 | Pass |
| Auto-group: the faculty run it; random teams within the size range, as few as possible, sizes differing by at most one; preview, re-roll, then confirm; nothing is saved before confirmation | `team-allocator.spec.ts` (16); `team-completion.service.spec.ts`; Integration (3); Browser completion check 10; Journey check 12 | Pass |
| Confirming creates every proposed team or none (anything changed since the preview); two confirmations of one preview cannot both succeed | Integration: all-or-nothing, racing confirmations | Pass |
| Auto-grouped students see their team without doing anything; its leader cannot change it | Browser completion check 11; Journey check 13 | Pass |
| Only the owning faculty complete a cycle's teams; other faculty get `404`; admins can look but not act | `team-access.policy.spec.ts`; RBAC matrix; Journey check 9 | Pass |
| Closing the cycle ends the faculty window | `team-rules.spec.ts`; Journey check 15 | Pass |
| Electives: faculty enroll students by pasting emails or uploading a CSV; non-student rows are reported, not added | Integration: electives; Browser completion checks 2–3; Journey check 16 | Pass |
| Only enrolled students see an elective, whatever their batch; its teams stay within the roster | `cycle-roster.spec.ts`; `cycle-authorization-policy`; Integration; Browser completion check 4; Journey checks 16–17 | Pass |
| A student in a team of an elective cannot be removed from its roster | Integration; Journey check 17 | Pass |
| Phase 4 rules still hold: the creator leads and is never replaced, added students join at once, one team per student per cycle, search shows "already in a team" | Phase 4 suites unchanged; Browser teams checks 1–11; Journey checks 1–4 | Pass |
| Demo accounts: an admin, two coordinators (admins), two faculty, two students in each of the batches 2023–2026; created by `npm run seed:demo`, safe to run again, refused where dev login is off; one-click sign-in on the login page | `demo-accounts.spec.ts`; Integration: demo accounts (5), dev login switched off; Browser sign-in checks with the picker shown | Pass |

## Bugs found and fixed

| # | Where | Bug | Fix |
| --- | --- | --- | --- |
| 1 | Faculty completion panel | Ticked students who were then placed another way (Add, auto-group) stayed in the "New team from N selected" form, with blank names in the leader list; creating the team failed. | The selection only counts students still without a team (`FacultyTeamPanels.tsx`). |
| 2 | Team note (students and faculty) | After the completion deadline, or once the cycle was closed, it still said "The faculty place anyone still without a team by …". | It now says the faculty's time has ended (`FormationNote` in `TeamPanels.tsx`). |
| 3 | Elective enrollment import | A refused email pasted twice was reported twice. | Repeats are skipped before sorting rows (`cycle-enrollment.service.ts`); the integration test now pastes a refused email twice. |
| 4 | Browser test `teams-ui` check 9 | Expected the faculty's team table without the Phase 5 "Formed by" column. | Expectation updated. |
| 5 | Browser tests | `auth-ui` moved a student into batch 2024, which `completion-ui` assumes it owns, so the count of students without a team was 6, not 5 (3 failed checks). | `auth-ui` now moves the student to 2025; the [e2e README](../../e2e/browser/README.md) lists the batch each script owns. |

## Flow review

Checked against the rules agreed in Phases 4 and 5. Everything above works as agreed. Three
points do not yet do everything we aimed for:

1. **Core-course students who never sign in are invisible.** A core course's roster is "every
   student of the batch who has signed in", because FlowForge has no list of a batch's students
   before their first sign-in. The faculty's "Students without a team" list, and auto-group, leave
   them out, with no warning. Electives do not have this problem: they list "not signed in yet".
   Options: import a batch roster for core courses too (the elective import, reused), or accept it
   and show "students who have not signed in yet are not listed".
2. **Strict sizes can leave a student who cannot be placed.** For example, sizes 3 to 3 with 7
   students: auto-group makes two teams and leaves one student, every team is full, and a team of
   one is too small. Sizes are locked after publishing, so the faculty have no way out. Options:
   let the faculty put one student over the maximum during completion, or accept it.
3. **Ideas are not built yet.** Ideas are due at the completion deadline (D2), and a rejected idea
   keeps its team; that is the next phase.

Known limitation, low risk: removing a student from an elective and adding that student to a
team at the same moment could both succeed, because the roster is read outside the team
transaction. Both actions belong to the same faculty member.

## How to run

- Unit and integration: in `backend/`, `npm test` and `npm run test:integration`.
- Browser: see the [e2e README](../../e2e/browser/README.md); run the three scripts in order on an
  empty `flowforge_test`.
- The flow journey was a one-off script for this review and is not part of the repository.
