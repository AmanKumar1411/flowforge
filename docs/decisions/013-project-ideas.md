# ADR 013: One idea per team, reviewed by version, with its own deadline

**Status:** Accepted (Phase 6). Supersedes the idea deadline in [ADR 009](009-team-rules-and-formation-deadline.md).

## Context

Each team proposes a project idea; the faculty approve or reject it. ADR 009 tied ideas to the
formation deadline, and Phase 5 moved them to the completion deadline. Teams the faculty create late
in their window would then have almost no time. The team decided:

- ideas have their **own deadline** (D3), after team completion (D2) and no later than "Submissions
  open"; it defaults to D2;
- a rejected idea can be revised and **resubmitted until submissions open**;
- the leader submits, the owning faculty review, members and admins read, and an idea never changes
  the team.

## Decision

- `CourseProjectCycle.ideaDeadline` with `D1 <= D2 <= D3 <= submissionStartAt`, checked by
  `CycleWorkflow.assertValidSchedule` and a database CHECK. Teams therefore also settle before
  submissions open (ADR 009 allowed formation up to the submission deadline). On a published cycle D3
  moves like the other stage deadlines: only while open, only to the future. A stage that ended
  together with a moved one moves with it, on the server and in the editor.
- `ProjectIdea` (one per team, unique `(teamId, cycleId)`, composite foreign key to the team) holds
  the current content: title, problem, solution, optional http(s) link, `status` and `version`.
  `IdeaReview` stores every decision with the version it was about; rejections need feedback (app
  and CHECK).
- `IdeaRules.submissionAction` decides what the leader's save does:
  - no idea, before D3: create (version 1);
  - waiting idea, before D3: edit (new version);
  - rejected idea, before submissions open: resubmit (new version, back to waiting);
  - approved: final (`409 IDEA_ALREADY_APPROVED`); anything else is closed (`409`).
- The **version goes up with every content change**, and a review sends back the version the
  faculty member read. A newer version is refused with `409 IDEA_CHANGED`, so nobody approves text
  they have not seen.
- Every write locks the team row `FOR SHARE` (a disband waits) and the idea row `FOR UPDATE`, and
  is audited in the same transaction (`IDEA_SUBMITTED`, `IDEA_UPDATED`, `IDEA_APPROVED`,
  `IDEA_REJECTED`).
- Visibility reuses the team rules through `TeamQueryService`: members, the owning faculty and admins
  see a team's idea; everyone else gets `404 TEAM_NOT_FOUND`. Only the owning faculty review.
- The ideas module reads teams and cycles through their modules' services (`IdeaTeams` port), like
  teams read cycles.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Ideas due at D1 or D2 | Late-placed teams get no time (the reason for this decision) |
| Keep every version as a row | The review history already records what was decided; the current content is what matters |
| Version only on resubmission | A faculty member could approve an edit they never saw |
| Several ideas per team, faculty pick one | Not asked for; one current idea keeps every later phase simple |
| Faculty "request changes" as a third outcome | Rejection with feedback and resubmission covers it |

## Consequences

- The cycle editor shows three stage dates; the API refuses a schedule out of order with a message
  per stage.
- A team without an idea at D3 cannot submit one; the faculty see it as "No idea yet". A rejection
  after submissions open is final for the cycle.
- Disbanding a team (only possible before D1) removes its idea with it.
