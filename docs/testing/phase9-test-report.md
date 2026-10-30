# Phase 9 test report: student experience and private evaluations

**Date:** 2026-10-30 · **Branch:** `phase9-student-side` (from `3a6bbfd`) · **Environment:** macOS,
Node 22.14, PostgreSQL 18 in Docker (`flowforge_test`), headless Chrome.

Only new tests and existing tests changed by this phase were run, as the prompt asks.

| Layer | Passed |
| --- | ---: |
| Backend unit (Jest): evaluations, dashboard, course-cycles, teams, ideas, submissions, links | **278 / 278** (19 suites) |
| Integration (`node:test`, real PostgreSQL): evaluations, dashboard, course-cycles, ideas, team-completion | **57 / 57** |
| Frontend (Vitest): student-dashboard, cycle-page, cycle-wizard, CycleDetailPage, CycleWizardPage | **32 / 32** |
| Browser: auth 20, teams 11, completion 11, ideas 9, submissions 7, cycles 10, student 5 (at 375px) | **73 / 73** |

Gates: backend `build`, `typecheck`, `lint`; frontend `build`, `lint`; migration applied to dev
and test, drift empty; `npm run seed:demo` against `flowforge_test` twice (created, then unchanged).

## What the tests prove

| Requirement | Test |
| --- | --- |
| Grading window, scale, feedback-only, empty save, release with 0 graded, version mismatch or missing | `evaluation-rules.spec.ts`; `evaluations.e2e.ts` |
| Policy: member before/after release, other team, other faculty, owner, admin | `evaluation-policy.spec.ts`; e2e privacy matrix (8 actors on team reads, 4 on grading, 4 on writes) |
| Release shows all teams together; a correction is a revision and "Updated"; late grading visible | `evaluations.e2e.ts` |
| Concurrent first saves: one 200, one 409 `EVALUATION_CHANGED` | `evaluations.e2e.ts` |
| Audit rows; forced audit failure rolls back; revisions are append-only | `evaluations.e2e.ts` |
| To-do rules at every boundary, role wording, no duplicates | `student-todo-rules.spec.ts` |
| Dashboard for a leader, a member, a student without a team; idea feedback as an update | `dashboard.e2e.ts` |
| Past projects for former members only; read-only; hidden from a batch-mate without a team | `dashboard.e2e.ts`, `cycle-authorization-policy.spec.ts`, `course-cycle.service.spec.ts` |
| Same query count for 1 and 5 projects (Prisma query events) | `dashboard.e2e.ts` |
| Equal team and idea deadlines (S5) | `milestone-schedule.spec.ts`, `cycle-workflow.spec.ts`, `team-completion.e2e.ts`, `ideas.e2e.ts`, `cycle-wizard.test.ts` |
| Student journey and faculty grading in the real app, at 375px | `student-ui.e2e.cjs` |

## Existing tests changed

| Test | Why |
| --- | --- |
| `milestone-schedule.spec.ts`, `cycle-workflow.spec.ts`, `course-cycle.service.spec.ts`, `team-completion.e2e.ts`, `ideas.e2e.ts`, `cycle-wizard.test.ts` | S5: equal deadlines are now valid; the refused case is an idea deadline before the team deadline |
| `course-cycle.service.spec.ts`, `team-test-kit.ts` | The service takes the `CycleMembership` lookup (S4) |
| `cycle-page.test.ts`, `CycleDetailPage.test.tsx` | Grading items in needs-attention; the Milestones tab loads grading (mocked) |
| Browser `auth-ui`, `teams-ui`, `completion-ui` | `/student` is now the dashboard; its empty state and project cards replaced the old list |

## Bugs the runs found

| Found by | Bug | Fix |
| --- | --- | --- |
| `evaluations.e2e.ts` | "Updated" compared Prisma's real-time `updatedAt` with the clock's release time | Evaluation times come from the injected `Clock` |
| Browser student check 5 | The assertion looked for a version label the row does not show after saving | Waits for "Saved" |
