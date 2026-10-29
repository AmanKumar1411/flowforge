# Phase 8 plan: faculty project lifecycle

Branch `phase8-faculty-lifecycle` from `main` at `ddf6658`. Analysis:
[phase8-faculty-lifecycle-baseline.md](../analysis/phase8-faculty-lifecycle-baseline.md).

Format: `Job N · goal · files · tests to add or update · done-check · depends on`.
Tests are written inside their job and run once at the end (Job 19).

**Compile gates.** Jobs 1–4 each typecheck on their own. Changing the Prisma schema changes the
generated client for every module at once, so Jobs 5–10 share one gate: after each of them,
`tsc --noEmit` may only report errors in files that a later job of the group owns. The same goes
for the frontend Jobs 13–16, which start by changing `types.ts`.

## Jobs

- [x] **Job 1 · Move `course-cycles` into the layered layout, with no behaviour change** ·
  `git mv` into `application/` (services, `enrollment-removal-checks`, `ports/cycle.repository`),
  `presentation/` (controllers, `dto/`), `testing/` (in-memory repository); fix imports in teams,
  ideas, submissions and specs · tests: none new, imports only · done: `tsc` clean, no file left
  at the module root except the module · depends on: –
  - Done first rather than as job 5, so every later job writes into the final folders.
- [x] **Job 2 · Link requirements** · `common/links/link-type.ts`, `link-requirement.ts`,
  `link-validators.ts`, `link.errors.ts`, `error-status.ts` · tests: `link-requirement.spec.ts`
  (valid/invalid per type, missing required, not allowed, duplicate, GitHub without a repo,
  Drive and Docs accepted, requirement overlap) · done: `tsc` · depends on: –
- [x] **Job 3 · `Milestone` and `MilestoneSchedule`** · `course-cycles/domain/milestone.ts`,
  `milestone-schedule.ts`, `cycle.errors.ts` · tests: `milestone-schedule.spec.ts` (valid; opens ≥
  due; due > evaluation; overlap; first before `ideaDeadline`; `teamDeadline >= ideaDeadline`; 0
  for publish and 11; duplicate names; A3 moves, refusals, past, add/remove) · done: `tsc` ·
  depends on: 2
- [x] **Job 4 · `CycleTimeline`** · `course-cycles/domain/cycle-timeline.ts` · tests:
  `cycle-timeline.spec.ts` with `FixedClock` (before/at/after every boundary, event order, limit) ·
  done: `tsc` · depends on: 3
- [x] **Job 5 · Schema, migration, cycle model** · `schema.prisma`, migration
  `20261029120000_milestones_and_links`, `cycle.types.ts`, `cycle-workflow.ts`, test reset list ·
  tests: update `cycle-workflow.spec.ts` · done: `prisma validate`, migrate deploy on dev and
  test DBs, empty drift, `tsc` errors only in Jobs 6–10 files · depends on: 3
- [x] **Job 6 · Cycle aggregate** · `prisma-cycle.repository.ts` (cycle + milestones in one
  transaction), `course-cycle.service.ts` (create/update with milestones, A3, audit), DTOs,
  in-memory repository, audit actions · tests: update `course-cycle.service.spec.ts`; e2e
  `course-cycles.e2e.ts` (3 milestones in one request, a schedule error saves nothing, A3, audit
  rows, forced audit failure rolls back) · done: gate · depends on: 5
- [x] **Job 7 · `PublishChecks`** · `application/publish-checks.ts`, course-cycles checks
  (schedule, `ROSTER_EMPTY`, CORE warning), ideas check (`IDEA_LIST_EMPTY`),
  `GET /course-cycles/:id/publish-checks`, `DomainError.details` · tests: unit
  `publish-checks.spec.ts`; e2e publish cases in `course-cycles.e2e.ts` · done: gate ·
  depends on: 6
- [x] **Job 8 · Teams** · `team-rules.ts` (`teamDeadline`, `isPlacementOpen` = A1),
  `team.ts`, `team-completion.service.ts` · tests: update `team-rules.spec.ts`,
  `team-access.policy.spec.ts`, `team-completion.service.spec.ts`, `team.services.spec.ts`; e2e
  `teams.e2e.ts`, `team-completion.e2e.ts` · done: gate · depends on: 5
- [x] **Job 9 · Ideas** · `idea.ts`, `idea-rules.ts` (`ideaSource`, links), DTOs, repository ·
  tests: update `idea-rules.spec.ts`, `idea.service.spec.ts`; e2e `ideas.e2e.ts` · done: gate ·
  depends on: 2, 5
- [x] **Job 10 · Submissions per milestone** · submission domain, rules, service, repository,
  controllers, DTOs · tests: update `submission-rules.spec.ts`, `submission.service.spec.ts`;
  e2e `submissions.e2e.ts` (windows per milestone, versions restart, Drive-only milestone,
  concurrent members) · done: **gate for Jobs 5–10: `tsc` clean** · depends on: 2, 5
- [x] **Job 11 · Timeline API and seed** · `CycleResponseDto.currentStage/nextEvents`,
  `GET /me/upcoming`, `prisma/seed.ts` demo cycle · tests: e2e `upcoming.e2e.ts`; update
  `rbac.e2e.ts`, `faculty-access.e2e.ts` for the new cycle body and routes · done: `tsc` ·
  depends on: 4, 10
- [x] **Job 12 · Backend docs in code** · Swagger descriptions on new DTOs and routes ·
  done: `tsc` · depends on: 11
- [x] **Job 13 · Frontend model** · `types.ts`, `api/cycles.ts`, `api/submissions.ts`,
  `teams.ts`, `ideas.ts`, `phases.ts`, `links.ts` · tests: `links.test.ts` · done: gate ·
  depends on: 11
- [x] **Job 14 · Wizard** · `cycle-wizard.ts`, `cycle-plan.ts`, `CycleWizardSteps.tsx`,
  `CycleWizardPage.tsx` (draft saved at step 1; Details, Teams & ideas, Milestones, Idea list,
  Students, Review & publish) · tests: rewrite `cycle-plan.test.ts`, `cycle-wizard` cases,
  `CycleWizardPage.test.tsx` · done: gate · depends on: 13
- [x] **Job 15 · Tabbed detail page** · `CycleDetailPage.tsx` (Overview, Students, Teams,
  Ideas, Milestones), `cycle-page.ts`, `MilestonePanels.tsx` · tests: update `cycle-page.test.ts`,
  `CycleDetailPage.test.tsx` · done: gate · depends on: 13
- [x] **Job 16 · Student side** · `StudentCyclesPage.tsx` (stage and next event),
  `SubmissionPanels.tsx` (one card per milestone), `IdeaPanels.tsx` (links), `TeamPanels.tsx` ·
  done: **gate for Jobs 13–16: frontend `tsc` clean** · depends on: 13
- [x] **Job 17 · Browser e2e** · `support.cjs`, the flows that change, new `wizard-ui.e2e.cjs`
  (blocked publish, then a successful one) · done: scripts parse (`node --check`) · depends on: 14–16
- [x] **Job 18 · Docs** · ADRs 016–019, amended notes on 009/011/013/015, architecture pages,
  README, test report · done: links resolve · depends on: all
- [x] **Job 19 · Test, build, lint, commit, report** · depends on: all

## Decisions not covered by the prompt

| # | Decision | Why |
| --- | --- | --- |
| D1 | The layout move (prompt job 5) runs first | Pure moves are safest before behaviour changes; later jobs write into final paths |
| D2 | Keep `cycle.types.ts` and `cycle.errors.ts` as the B8 "types" and "errors" | Renaming them would touch every module for no behaviour |
| D3 | The migration keeps dev data: each existing cycle gets one "Final submission" milestone from its old window; old URLs become links | No reset needed; nothing is destroyed |
| D4 | The database CHECK is `teamDeadline <= ideaDeadline`; strictness is a domain rule | Existing rows have equal deadlines (the old default) |
| D5 | A draft may have 0 milestones; publish needs at least 1 (`NO_MILESTONES`) | The wizard saves the draft at step 1, before milestones exist |
| D6 | `teamDeadline` and `ideaDeadline` are required on create; the wizard sends its defaults at step 1 | One rule for every client; no server-side guessing |
| D7 | `milestones` in a PATCH is the full list; an item with `id` keeps that milestone, order sets positions | Stable ids for submissions, one simple contract |
| D8 | After publish a milestone's name and link requirement are locked too; `MILESTONES_LOCKED` covers add, remove and reorder; `MILESTONE_LOCKED` an opened milestone or a locked field | A3 lists only dates and description |
| D9 | `ideaSource` and `ideaLinkRequirement` change only in a draft | They are rules students rely on, like `kind` |
| D10 | `STUDENT_PROPOSALS` also refuses new catalog ideas (`CATALOG_NOT_ALLOWED`) | A list no one can pick from is a mistake |
| D11 | `GET /course-cycles/:id/publish-checks` previews the checks | The Review step shows them before publishing |
| D12 | A successful publish returns the cycle plus `warnings` | The CORE warning must reach the faculty |
| D13 | Error bodies gain an optional `details: [{code, message}]` | `PUBLISH_BLOCKED` lists every failure |
| D14 | An event at exactly `now` is past; ties sort team deadline, idea deadline, due, evaluation, opens, then position | Windows close at `now >= deadline`; the closing event comes before the next opening |
| D15 | `currentStage` prefers an OPEN milestone, then one awaiting evaluation, then the next upcoming | M2 may open before M1 is evaluated |
| D16 | The old routes `/teams/:id/submissions` and `/course-cycles/:id/submissions` are removed | Every submission now belongs to a milestone |
| D17 | An empty link URL counts as absent; a duplicate type is `INVALID_LINK` | Forms send empty optional fields |
| D18 | `TEAM_COMPLETION_CLOSED` stays as the placement-window code; `INVALID_TEAM_FORMATION_DEADLINE` → `INVALID_TEAM_DEADLINE`; `INVALID_TEAM_COMPLETION_DEADLINE` removed | Codes follow the fields |
| D19 | `npm run seed:demo` also creates and publishes the AIML demo cycle (M1, M2 GitHub; Final Drive) once | B10 |
| D20 | The cycle DTO carries `milestones[]`; the repository loads them with the cycle | One aggregate |
| D21 | The CORE warning fires when the batch has no active student (signed in or pre-registered) | "Pre-registered students" in B6 |
| D22 | `Milestone(id, cycleId)` is unique so a later `Evaluation` can reference it with a composite FK | A2 |

## Notes per job

- Job 1: moved with a script that rewrites relative imports (`git mv`, so history follows); 21 files rewritten, `tsc` clean.
- Job 2: `LinkRequirement.check` returns links in a fixed type order, so versions read alike; `LINK_TYPES` plus one validator class is all a new type needs.
- Job 3: also `planMilestones` / `unknownIds` (the id-stable diff) and `INVALID_MILESTONE` for an empty or too-long name or description.
- Job 4: `CycleTimeline` takes the `Clock` in its constructor; Nest builds it with a factory provider.
- Job 5: migration keeps dev data (D3); the dev DB went from 2 cycles to 2 milestones, drift empty. Renamed `INVALID_TEAM_FORMATION_DEADLINE` → `INVALID_TEAM_DEADLINE`.
- Job 6: `currentStage` and `nextEvents` went into `CycleResponseDto` here (the DTO was rewritten anyway), and `upcomingFor` into the service; Job 11 keeps only `/me` wiring and the seed. Every change locks the cycle row (`lockById`), so the concurrent-publish race is now settled by the lock.
- Job 7: `DomainError` gained `details`; the filter adds it to the body only when present.
- Job 8: `isCompletionOpen` → `isPlacementOpen`; the team test kit gives the cycle service its own no-op audit so team specs still see only team events.
- Job 9: proposals get `links` checked with `ideaLinkRequirement`; `CatalogIdea.link` stays (the faculty's reference), picks copy no links.
- Job 11: `/me/upcoming` lives in a small `MeController` in course-cycles (students only); new e2e file `upcoming.e2e.ts`. The seed creates the AIML demo cycle for the first demo faculty account and publishes it; dates count from the day it runs.
- Job 12: the Swagger descriptions were written with each DTO and route in Jobs 6–11, so this job only checked them.
- Job 13: `ApiError` carries `details`; `readableError` names each problem of a blocked publish. New `links.ts` (labels and the link checks mirrored for display) and `timeline.ts` (stage and event words).
- Job 14: the wizard is 6 steps (the idea list step hides when ideas come only from teams); the step is in the URL (`?step=`), so the detail page links to Review to publish. `currentSemester` now treats June as the even semester (B9: Jan–Jun).
- Job 15: phases come from the API's `currentStage` instead of client dates; `PAGE_PARTS` keeps only team completion (the idea list now follows `ideaSource`).
- Job 16: one card per milestone on the student's project page and on the faculty's team page; cycle cards show the stage and the next event.
- Job 17: the wizard flow with a blocked, then successful, publish lives in `cycles-ui.e2e.cjs` (the wizard's own script) instead of a new `wizard-ui` file. `createCycleInWizard` drives the 6 steps; `openSection` became `openTab`; `cycleBody` builds API cycles. While writing it: the panels' own forms are kept out of the wizard's form, a later idea deadline moves milestones along (`withIdeaDeadline`), and "Start from a previous project" was restored (`stateFromTemplate`).
- Job 18: ADRs 016–019; amendment notes on 009, 011, 013, 015; `course-cycles.md` rewritten; Phase 8 sections in `submissions.md`, `ideas.md`, `teams.md`; README phase list, API table and docs list.
- Job 19: 226 backend unit, 451 integration, 50 frontend and 68 browser checks pass (only new and changed suites, per the prompt). The browser run found a real wizard bug (a reload after the first save overwrote typed dates), fixed. Lint formatting applied with `eslint --fix` on changed backend files only.
- Job 10: the submissions adapter now also reads the cycle through `CourseCycleService` for its milestones (the ideas module's `IdeaCycle` has none). The cycle list per milestone also returns every version (`versions`), for the faculty's Milestones tab.
