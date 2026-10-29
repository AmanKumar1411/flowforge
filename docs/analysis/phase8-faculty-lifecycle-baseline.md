# Phase 8 baseline: faculty project lifecycle

Snapshot before Phase 8 (milestones, link requirements, guided creation) starts.
Commit analysed: `ddf6658` on `main` (merge of PR #5, the cycle wizard), branch
`phase8-faculty-lifecycle` created from it.

## 1. Baseline results

| Check | Result |
| --- | --- |
| `git status` | Clean |
| backend `npm run build` | Pass |
| frontend `npm run build` | Pass (376 kB JS) |
| backend `prisma validate` | Pass |
| backend `prisma migrate status` | 7 migrations, database schema up to date |

Tests were not rerun: they passed on the merged branch.

## 2. The current model

### Cycle (`CourseProjectCycle`)

`backend/prisma/schema.prisma: CourseProjectCycle` holds the academic context (course, title,
description, kind, batch, semester, academic year, team sizes) and **one** schedule:

```
teamFormationDeadline <= teamCompletionDeadline <= ideaDeadline <= submissionStartAt < submissionDeadline
```

Three CHECKs guard it: `CourseProjectCycle_submission_window_check`,
`CourseProjectCycle_team_deadlines_check`, `CourseProjectCycle_idea_deadline_check`.

`backend/src/course-cycles/domain/cycle-workflow.ts: CycleWorkflow`:
- `transition` with the table `DRAFT → PUBLISHED → CLOSED`;
- `editableFields`: everything in DRAFT; `description`, `submissionDeadline` and the three stage
  deadlines in PUBLISHED; nothing in CLOSED;
- `assertValidSchedule`: team sizes and the order above;
- `assertStageDeadlineChange`: on a published cycle a stage deadline moves only while its stage is
  open, and only to a future time;
- `assertCompletionWindow`: the faculty's window ends after the students' deadline;
- `validatePublishRules`: only re-runs `assertValidSchedule`.

`course-cycle.service.ts` builds defaults (formation = start, completion = formation, idea =
completion), keeps later stages glued to earlier ones (`followMovedStages`), and saves with
single-row compare-and-set updates (`updateFields`, `transitionStatus` with `WHERE status`).
**Cycle changes are not audited** and no transaction wraps them.

### Uses of the fields that go away

| Field | Backend | Tests | Frontend | Browser e2e |
| --- | --- | --- | --- | --- |
| `submissionStartAt`, `submissionDeadline` | cycle types, DTOs, workflow, service; `SubmissionRules.window`; `IdeaCycle`/`SubmissionCycle` picks | 6 unit specs, 8 e2e files | `types.ts`, `cycle-plan.ts`, `cycle-wizard.ts`, `phases.ts`, `ideas.ts: submissionWindow`, `cycle-page.ts: phaseOf`, `SubmissionPanels`, `CycleParts`, wizard steps | `support.cjs`, cycles, teams, submissions, completion |
| `teamCompletionDeadline` | cycle types, DTOs, workflow, service; `TeamRules.isCompletionOpen`; `TeamCycle` | `cycle-workflow.spec`, `course-cycle.service.spec`, `team-rules.spec`, `team-access.policy.spec`, `team-completion.service.spec`, `team-completion.e2e`, `ideas.e2e` | `types.ts`, `teams.ts`, `phases.ts`, `cycle-plan.ts`, `cycle-wizard.ts`, `TeamPanels`, `CycleDetailPage` | `support.cjs`, ideas, completion |
| `teamFormationDeadline` (renamed `teamDeadline`) | same as above plus `TeamRules.isFormationOpen` | nearly every spec and e2e file | `teams.ts`, `TeamDetailPage`, `TeamPanels`, wizard | every flow |
| `Submission.repositoryUrl/demoUrl/reportUrl` | submission domain, DTOs, repository | `submission-rules.spec`, `submission.service.spec`, `submissions.e2e`, `rbac.e2e` | `types.ts`, `SubmissionPanels` | `submissions-ui` |
| `ProjectIdea.link` | idea domain, DTOs, repository | idea specs, `ideas.e2e` | `IdeaPanels`, `types.ts` | `ideas-ui` |

### Teams

`backend/src/teams/domain/team-rules.ts`:
- `isFormationOpen`: published and `now < teamFormationDeadline`;
- `isCompletionOpen`: published and `teamFormationDeadline <= now < teamCompletionDeadline`.

`TeamCompletionService` (manual team, add member, auto-group preview and apply) calls
`assertCompletionOpen` through `openCycleFor` and `addMember`. `overview.open` reports the window.

### Ideas

- `backend/src/ideas/domain/idea-rules.ts: IdeaRules`: first idea before `ideaDeadline`, a waiting
  proposal editable until then, revisions after a rejection while published, review while
  published; `clean` / `pickContent` / `cleanCatalog` trim content.
- `ProjectIdea.link` is one optional free-text URL; a pick copies `CatalogIdea.link`.
- `CatalogIdea` (ADR 014) is the faculty's list; nothing restricts a cycle to proposals or to the
  list.

### Submissions

- `backend/src/submissions/domain/submission-rules.ts: SubmissionRules`: one window per cycle
  (`submissionStartAt <= now < submissionDeadline`, published), a member of a team with an
  approved idea.
- `Submission`: versions `1..n` per team (`@@unique([teamId, version])`), numbered under
  `SELECT … FROM "Team" … FOR UPDATE` in `PrismaSubmissionRepository.lockLatestVersion`; a
  unique violation becomes `SUBMISSION_CHANGED`. `repositoryUrl` is required (DTO `@IsUrl`).

### Registries

`backend/src/course-cycles/enrollment-removal-checks.ts: EnrollmentRemovalChecks` is a plain
list of async checks; `TeamEnrollmentGuard.onModuleInit` registers one, so course-cycles never
imports teams. Publish has no such extension point.

### Frontend

- `CycleEditorPage` no longer exists: PR #5 replaced it with `CycleWizardPage` (4 steps: Basics,
  Teams, Timeline, Review). Dates come from a start date plus phase lengths
  (`cycle-plan.ts: buildSchedule`); nothing is saved until Review.
- `CycleDetailPage`: header, phase bar (`phases.ts: cyclePhases`), two columns (teams list,
  completion panel, idea list for core courses; "At a glance" side card). `CycleStudentsPage` and
  `TeamDetailPage` are separate routes.
- `StudentCyclesPage` lists cards; `CycleDetailPage` for students shows `StudentTeamPanel`, which
  includes the idea and submission panels.

### Layout of `course-cycles` compared with the other modules

`teams`, `ideas` and `submissions` use `domain/ application/ (ports/) infrastructure/
presentation/ (dto/) testing/`. `course-cycles` is flat: services, controllers and
`enrollment-removal-checks.ts` at the root, `dto/` at the root, the repository port and the
in-memory repository inside `domain/`.

## 3. What changes

| Area | Change |
| --- | --- |
| Cycle | `teamFormationDeadline` → `teamDeadline`; `teamCompletionDeadline`, `submissionStartAt`, `submissionDeadline` removed; `ideaSource` and `ideaLinkRequirement` added |
| Milestone | New table in the cycle aggregate, `1..10` per cycle, saved with the cycle in one transaction |
| Links | New `common/links` value objects and a validator registry; JSON columns for requirements and links |
| Submissions | Scoped to a milestone (composite FK), versions per `(team, milestone)`, `links[]` instead of three URL columns, new routes |
| Ideas | `link` → `links[]` checked against the cycle's requirement; `ideaSource` decides proposals vs. catalog |
| Teams | Faculty placement window is `teamDeadline <= now < ideaDeadline` (A1) |
| Publish | `PublishChecks` registry; all failures reported together (`409 PUBLISH_BLOCKED`) |
| Audit | `CYCLE_CREATED/UPDATED/PUBLISHED/CLOSED`, inside the change's transaction |
| Timeline | Computed `currentStage` and upcoming events; `GET /me/upcoming` |
| Frontend | 5-step wizard saving a draft from step 1; tabbed detail page; per-milestone student cards |

## 4. Migration impact

There is no production data, but the dev database has cycles, teams, ideas and submissions. One
migration (`20261029120000_milestones_and_links`) keeps them usable instead of wiping them:

1. Rename `teamFormationDeadline` to `teamDeadline`.
2. Create `Milestone` and give every existing cycle one milestone, "Final submission", from its
   `submissionStartAt` / `submissionDeadline` (evaluation at the deadline).
3. Add `Submission.milestoneId` and `links`; fill them from that milestone and the three URL
   columns; then make them required and drop the URL columns.
4. `ProjectIdea.link` → `links` (a GitHub URL becomes `GITHUB`, a Drive or Docs URL `DRIVE`, any
   other `REPORT`).
5. Drop the three old CHECKs and the removed columns; add `teamDeadline <= ideaDeadline` and the
   milestone CHECKs.

The dev database does **not** need a reset; old cycles whose team and idea deadlines are equal
are flagged by the stricter domain rule the next time they are edited or published.

## 5. Risks

- **Breadth.** Almost every unit spec and integration file creates cycles with the old fields;
  they are updated where the model forces it, not rewritten.
- **Reordering milestones** under `@@unique([cycleId, position])` can collide mid-update; the
  repository first moves the cycle's positions out of the way inside the transaction.
- **`ALTER TYPE … ADD VALUE`** for the new audit actions runs in the migration's transaction;
  PostgreSQL allows it as long as the new values are not used in the same transaction.
- **The wizard rewrite** touches the largest frontend files (`CycleWizardSteps.tsx`, 902 lines;
  `cycle-wizard.ts`, 417 lines) and their tests.
- **Strict `teamDeadline < ideaDeadline`** is enforced in the domain; the database CHECK stays
  `<=` so the migration does not have to change the dates of existing rows.
