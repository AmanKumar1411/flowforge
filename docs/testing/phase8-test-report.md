# Phase 8 test report: milestones, link requirements and guided creation

**Date:** 2026-10-30 · **Branch:** `phase8-faculty-lifecycle` (from `ddf6658`) · **Environment:**
macOS, Node 22.14, PostgreSQL 18 in Docker (`flowforge_test`), headless Google Chrome

## Result

Per the phase plan, only the **new tests and the existing tests changed by the model** were run
(listed below); unaffected suites (auth, sessions, admin, config, boot, rate limits, demo
accounts, roster, allocator, team rows, and the like) were not rerun.

| Layer | Runner | What it exercises | Passed |
| --- | --- | --- | ---: |
| Unit (backend) | Jest | Links, milestone schedule, timeline, workflow, cycle/teams/ideas/submissions services and rules | **226 / 226** (13 suites) |
| Integration | `node:test` + real PostgreSQL | Full HTTP API: course cycles, upcoming, submissions, teams, team completion, ideas, RBAC matrix, faculty access | **451 / 451** (8 files) |
| Unit (frontend) | Vitest | Links, plan, wizard, page logic, semester, team rows, errors; wizard and project pages with the API mocked | **50 / 50** (9 files) |
| Browser end-to-end | Chrome via `playwright-core` | Real React app against the real API, all six scripts | **68 / 68** (20 sign-in, 11 teams, 11 completion, 9 ideas, 7 submissions, 10 wizard and project page), 139 s |

| Gate | Result |
| --- | --- |
| Backend `build`, `typecheck` (including tests), `lint` | Pass |
| `prisma validate`; migrate deploy on dev and test databases (8 migrations) | Valid, up to date |
| Migration drift (`prisma migrate diff` from the database to the schema) | Empty |
| Frontend `build`, `tsc`, `lint` | Pass |
| `npm run seed:demo` against `flowforge_test`, twice | Creates and publishes "AIML demo project" (M1, M2 GitHub; Final Drive), then reports it unchanged |

## Requirement traceability

| Requirement | Covered by | Result |
| --- | --- | --- |
| Milestones in order: opens < due ≤ evaluation; each after the previous is due; M1 after the idea deadline; `teamDeadline < ideaDeadline`; 0 (to publish) and 11 refused; unique names | `milestone-schedule.spec.ts`; `cycle-workflow.spec.ts`; Integration: schedule errors save nothing; DB `Milestone_window_check` | Pass |
| A3: an unopened milestone moves; an opened one is refused; no moves into the past; no add/remove/reorder | `milestone-schedule.spec.ts`; `course-cycle.service.spec.ts`; Integration: A3 | Pass |
| Links per type: GitHub needs a repo, Drive and Docs accepted, missing required, not allowed, duplicate | `link-requirement.spec.ts`; `submission-rules.spec.ts`; Integration: Drive-only milestone, link checks | Pass |
| `CycleTimeline` before / at / after every boundary; event order | `cycle-timeline.spec.ts` | Pass |
| `IdeaRules` × each `ideaSource`; idea links follow the cycle's requirement; a pick copies no links | `idea-rules.spec.ts`; Integration: where ideas come from | Pass |
| Create a cycle with 3 milestones in one request; a schedule error saves nothing; ids kept through draft edits | Integration: milestones (Phase 8) | Pass |
| Publish reports elective without students, `FACULTY_LIST` with an empty list and no milestones together; core without students publishes with a warning | `course-cycle.service.spec.ts`; Integration: publish checks; Browser cycles check 3 | Pass |
| Submissions: refused before M1 opens and after it is due; accepted for M1 while M2 is upcoming; M2 versions restart at 1; Drive-only milestone takes Drive and refuses GitHub | `submission-rules.spec.ts`; `submission.service.spec.ts`; Integration: submissions | Pass |
| Two members submitting at once get versions 1 and 2, no duplicate | Integration: concurrent submit | Pass |
| Teams: student changes refused at/after `teamDeadline`; faculty placement from it until `ideaDeadline` only | `team-rules.spec.ts`; `team-completion.service.spec.ts`; Integration: teams and team completion | Pass |
| Ideas: no first proposal after the deadline; a revision after rejection still accepted | Integration: ideas (unchanged cases, rerun) | Pass |
| `/me/upcoming`: the student's own visible cycles only, in time order, never another batch's | `course-cycle.service.spec.ts`; Integration: upcoming events; RBAC matrix | Pass |
| Audit rows for create, update, publish, close; a forced audit failure rolls the change back | `course-cycle.service.spec.ts`; Integration: audit (trigger raises on `CYCLE_UPDATED`) | Pass |
| Wizard: draft saved at step 1, live overlap flags, review links each problem to its step, blocked then successful publish | `CycleWizardPage.test.tsx`; `cycle-wizard.test.ts`; Browser cycles checks 1–3 | Pass |
| Tabbed project page; per-milestone student cards; stage and next event on cards | `CycleDetailPage.test.tsx`; `cycle-page.test.ts`; Browser cycles, submissions checks | Pass |

## Tests changed by new behaviour

| Test | Why it changed |
| --- | --- |
| `cycle-workflow.spec.ts` | Rewritten: new editable fields, schedule with milestones, `INVALID_TEAM_DEADLINE`, publish problems |
| `course-cycle.service.spec.ts` | Rewritten: the service now takes publish checks, timeline, audit and transactions; old cases for the completion window and submission window removed |
| `team-rules.spec.ts`, `team-access.policy.spec.ts` | `teamFormationDeadline`/`teamCompletionDeadline` → `teamDeadline`/`ideaDeadline`; `isCompletionOpen` → `isPlacementOpen` (A1); the "no window" case removed (the window always has length) |
| `team.services.spec.ts`, `team-completion.service.spec.ts` | Cycle bodies need an idea deadline and a milestone to publish; the closed-window message names the idea deadline |
| `idea-rules.spec.ts`, `idea.service.spec.ts` | `IdeaCycle` has `ideaSource` and `ideaLinkRequirement` instead of the submission window; `link` → `links`; picks copy no links |
| `submission-rules.spec.ts`, `submission.service.spec.ts` | Rewritten for per-milestone windows, versions and links |
| `course-cycles.e2e.ts` | Rewritten around milestones, publish checks and audit; the Phase 2 lifecycle cases kept |
| `teams.e2e.ts`, `team-completion.e2e.ts`, `ideas.e2e.ts`, `submissions.e2e.ts` | New cycle bodies; the completion-deadline test became the A1 window test; submissions on milestone routes |
| `rbac.e2e.ts`, `faculty-access.e2e.ts` | New cycle body; milestone routes; new rows for publish checks and `/me/upcoming`; an elective is enrolled before it is published |
| `semester.test.ts` | June is now the even semester (B9: January–June) |
| `cycle-plan.test.ts`, `cycle-page.test.ts`, `CycleDetailPage.test.tsx`, `CycleWizardPage.test.tsx` | Rewritten for the new plan, phases from the API's stage, tabs and the six-step wizard |
| Browser: `cycles-ui`, `completion-ui`, `ideas-ui`, `submissions-ui`, `teams-ui`, `support.cjs` | New wizard steps and labels, tabs instead of collapsible sections, milestone routes and link fields |

## Bugs the runs found, fixed before the final run

| Found by | Bug | Fix |
| --- | --- | --- |
| Browser: completion and ideas checks 1 | Saving the first wizard step moves to the project's edit URL; the same page instance then loaded the project again and replaced a date the faculty had just typed | The wizard remembers which project it holds (`heldId`) and ignores replies of a stale load |
| Integration: A3 test | The test moved a milestone's due date past its evaluation (its offset ignored the advanced clock) | Test offset corrected; the API was right to refuse |
| Unit: three specs failed to load | `class-transformer`'s `@Type` needs `reflect-metadata`, which Jest does not load. The real cause: `CourseCycleService` imported its request and response DTOs from `presentation/`, so the specs loaded HTTP decorators | First stubbed; then fixed at the source (branch `phase8-cycle-layering`): the service takes commands and returns views, controllers map DTOs, and the `class-transformer` and `@nestjs/swagger` stubs are gone from the cycle and team specs |
| Browser: submissions and cycles checks | The scripts read the overview while another tab was open, and opened the wizard from a project page | Scripts open the right tab or page first |
| Lint | Formatting of new files; an impure `Date.now()` in render; a synchronous `setState` in an effect | `eslint --fix` on the changed backend files; `now` passed in; review checks keyed by visit |

## Notes

- `team-completion.e2e.ts` publishes electives that start with an empty roster by inserting one
  placeholder enrollment for the publish check and deleting it right after, so the tests keep
  starting from an empty roster.
- The forced audit failure adds a temporary trigger on `AuditLog` that raises for
  `CYCLE_UPDATED`, and drops it in a `finally`.
