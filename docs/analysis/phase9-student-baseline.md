# Phase 9 baseline: the student side and private evaluations

Commit analysed: `3a6bbfd` on `main` (PR #7, the cycle layering fix). Branch `phase9-student-side`.

## Baseline

| Check | Result |
| --- | --- |
| `git status` | Clean; `phase8-cycle-layering` merged (PR #7) |
| backend and frontend `build` | Pass |
| `prisma validate`, `prisma migrate status` | Valid; 8 migrations, up to date |

## The student journey today

| Step | Where | Notes |
| --- | --- | --- |
| Sign in, batch from email | `auth/*`, `LoginPage` | Done (Phases 3–5) |
| See projects | `frontend/src/pages/StudentCyclesPage.tsx` → `GET /course-cycles` | Cards with stage and next event (Phase 8); no "what to do", no past projects |
| Open a project | `pages/CycleDetailPage.tsx` (student branch, `faculty=false`) | Header, stage line, `PhaseTimeline`, then everything in one `StudentTeamPanel` |
| Team | `components/TeamPanels.tsx: StudentTeamPanel` → `GET /course-cycles/:id/teams` (own team only, `TeamAccessPolicy`) | Leader edits until `teamDeadline` |
| Idea | `components/IdeaPanels.tsx: TeamIdeaPanel` → `/teams/:id/idea` | Feedback reaches students through `Idea.reviews` (newest first), shown by `IdeaDetails` as a review list; the version each review was about is shown, but not the content of earlier versions |
| Work | `components/SubmissionPanels.tsx: TeamSubmissionPanel` → one card per milestone | No evaluation exists anywhere |
| What comes next | `CycleTimeline.upcomingEvents`, `GET /me/upcoming` | **Unused by the frontend**; cards show only the next event |

Student read access: `CycleAuthorizationPolicy.canRead` (`backend/src/course-cycles/domain/cycle-authorization-policy.ts`)
allows a student a **published** cycle of their batch, or an elective they are enrolled in; a
closed cycle is invisible, so a student loses their own past work and (once they exist) marks.

## Gaps

1. No evaluations: no marks, no feedback on work, no release.
2. No single place that says what to do now; `/me/upcoming` is not used; no updates feed.
3. Past (closed) projects disappear for students.
4. The project page has no structure for students (one long panel); leader-only actions are
   simply absent for members instead of explained.
5. `MilestoneSchedule` requires `teamDeadline < ideaDeadline` (Phase 8, D4), while the database
   CHECK `CourseProjectCycle_team_idea_deadline_check` already allows `<=`. S5 aligns the domain
   with it: **no migration is needed for S5**.

## Changes

| Area | Change |
| --- | --- |
| `src/evaluations/` (new module) | `MilestoneGrading`, `Evaluation`, `EvaluationRevision`; pure `EvaluationRules` and `EvaluationPolicy`; grading, release, student reads; audit |
| `src/dashboard/` (new, read-only) | `GET /me/dashboard`: up next (events + `StudentTodoRules`), updates, project cards; composes other modules' exported services through one port |
| course-cycles | S4: a former team member reads a closed cycle (membership comes from teams through a registered lookup, so course-cycles does not import teams); S5 |
| teams, ideas, submissions | Batched queries by team ids (`IN (…)`) for the dashboard |
| Frontend | Student dashboard at `/student`, project page at `/student/projects/:id?tab=`, panels in `components/student/`; faculty grading in the Milestones tab |

## Risks

- **Privacy.** Marks must never reach another team. Three layers: the policy, the SQL filter
  (released + the caller's team), and 404 for anything hidden.
- **N+1 on the dashboard.** Every source is read once for all of the student's teams; a
  query-count test compares 1 and 5 projects.
- **Lost updates when grading.** Two tabs saving the same evaluation: optimistic concurrency on
  `version`, with the unique key catching two concurrent creates.
- **Visibility change (S4)** touches the policy every module reads through; integration tests on
  closed cycles must show read-only access for former members only.
- **Context budget.** This phase is large; jobs stay small and layered.
