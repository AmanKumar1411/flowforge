# Phase 9 plan: student experience and private evaluations

Branch `phase9-student-side` from `main` at `3a6bbfd`. Analysis:
[phase9-student-baseline.md](../analysis/phase9-student-baseline.md).
Format: `Job · goal · files · tests · done-check · depends on`. Tests are written in their job and
run once at the end (Job 15). After each job: `tsc --noEmit` and a tick here.

## Jobs

- [x] **Job 1 · S5: equal team and idea deadlines** · `milestone-schedule.ts`, wizard check and hint ·
  tests: `milestone-schedule.spec.ts`, `cycle-wizard.test.ts`, changed e2e cases · done: `tsc` · –
- [x] **Job 2 · Evaluations domain** · `evaluations/domain/{evaluation,evaluation-rules,evaluation-policy,evaluation.errors}.ts` ·
  tests: `evaluation-rules.spec.ts`, `evaluation-policy.spec.ts` · done: `tsc` · –
- [x] **Job 3 · Schema** · `MilestoneGrading`, `Evaluation`, `EvaluationRevision`, audit actions, migration, test reset list ·
  done: validate, deploy (dev + test), empty drift · 2
- [x] **Job 4 · Evaluations service** · ports, Prisma repository (FOR UPDATE on the grading row, unique → `EVALUATION_CHANGED`), service with audit · 3
- [x] **Job 5 · Evaluations API** · controllers, DTOs (`implements` commands), module · tests: e2e `evaluations.e2e.ts` · 4
- [x] **Job 6 · Visibility (S4)** · `CycleMembership` lookup registered by teams; `canRead` for closed cycles; past cycles query ·
  tests: `cycle-authorization` cases, e2e closed-project cases · –
- [x] **Job 7 · Dashboard domain** · `dashboard/domain/{student-todo-rules,dashboard-updates}.ts` · tests: `student-todo-rules.spec.ts` · –
- [x] **Job 8 · Dashboard API** · batched reads in teams/ideas/submissions/evaluations; `StudentSources` port + adapter; `GET /me/dashboard`;
  Prisma query events · tests: e2e `dashboard.e2e.ts` (roles, past projects, equal query count) · 5, 6, 7
- [x] **Job 9 · Faculty grading UI** · `api/evaluations.ts`, `components/faculty/GradingPanel.tsx`, needs-attention items · tests: `grading.test.ts` · 5
- [x] **Job 10 · Student dashboard UI** · `pages/StudentDashboardPage.tsx`, `components/student/*`, routes · tests: `dashboard.test.ts` · 8
- [x] **Job 11 · Student project page** · tabs, "what you need to do now", idea history, milestone cards with evaluation, read-only banner · 10
- [x] **Job 12 · Seed** · M1 released, M2 open, rejected-then-approved idea, a closed past project · 5
- [x] **Job 13 · Browser e2e** · `student-ui.e2e.cjs` (student journey, faculty grading, 375px) · 9–11
- [x] **Job 14 · Docs** · ADRs 020–022, ADR 016 amendment, `evaluations.md`, `student-experience.md`, viva notes, README · all
- [x] **Job 15 · Test, build, lint, commit, report** · all

## Decisions not covered by the prompt

| # | Decision | Why |
| --- | --- | --- |
| P1 | S5 needs no migration: the database CHECK is already `teamDeadline <= ideaDeadline` (Phase 8, D4) | Only the domain rule was strict |
| P2 | S4 membership comes from teams through a lookup registered with course-cycles (`CycleMembership`), like `EnrollmentRemovalChecks` | course-cycles must not import teams |
| P3 | Grading (marks, feedback, release) is open from the milestone's `submissionDueAt` while the cycle is published; `maxMarks` can be set any time before the cycle closes | "until the cycle closes"; the faculty can set the scale early |
| P4 | Marks need a `maxMarks`: giving marks without one is `409 MAX_MARKS_NOT_SET` | `marks ≤ maxMarks` needs a max |
| P5 | Saving neither marks nor feedback is `400 EMPTY_EVALUATION` (the CHECK enforces it too) | One mark or feedback per evaluation |
| P6 | "Updated" means the evaluation was saved again after its milestone's release (`updatedAt > releasedAt`) | S2 |
| P7 | Students see marks, max, feedback, release date and last change; not who graded | Feedback is from the course, not a person |
| P8 | The dashboard reads every other module through one port (`StudentSources`) with one adapter calling their exported services | Same rule as other modules; one place to batch |
| P9 | Query counting uses Prisma query events (`log: [{ emit: "event", level: "query" }]`), emitted only to listeners | The N+1 test needs a count |
| P10 | `/student/cycles` redirects to `/student`; `/student/cycles/:id` to `/student/projects/:id?tab=all` | Old links keep working |
| P11 | `GET /grading` admits students so the policy can answer 404; writes are FACULTY-only routes (admins and students get the usual role 403) | Hidden reads are 404; writes follow the app's role-guard convention |
| P12 | `?tab=all`: the project page as one view, with no tab button, for old links | Bookmarks and older flows keep working |
| P13 | The demo seed builds the app with a `FixedClock` moved through the past, so every seeded step goes through the real rules | A released M1 needs dates in the past |
| P14 | The open-milestone to-do needs an approved idea | Never ask for something the student cannot do |

## Notes per job

- Job 1: domain rule only (P1); the wizard error now reads "Can't be before the team deadline".
- Job 3: migration `20261030120000_evaluations` (3 tables, CHECKs, an append-only trigger, 3 audit actions); applied to dev and test; drift empty.
- Job 4: optimistic saves (conditional update on `version`, unique key on first saves); the grading row is locked `FOR UPDATE` for scale and release and `FOR SHARE` during saves.
- Job 5: students may call `GET /grading` so the policy answers 404 (P11); writes stay FACULTY-only (role 403, as elsewhere).
- Job 6: `CycleMembership` filled by `TeamCycleMembership`; `listPastForStudent`.
- Job 8: batched `listByTeams` (ideas) and `listSubmittedMilestones` (submissions); `SubmissionsModule` now exports its service; Prisma emits query events (P9).
- Jobs 10–11: `StudentCyclesPage` removed (replaced by the dashboard); old links open the project page as one view (`?tab=all`, P12).
- Job 12: `seed-journey.ts` runs the real services with a clock moved through the past (P13).
- Job 13: `student-ui.e2e.cjs`; dashboard-related assertions updated in the auth, teams and completion flows.
- Job 15: 278 unit, 57 integration, 32 frontend and 73 browser checks pass (new and changed suites only). Found and fixed: evaluation times now come from the injected clock.
