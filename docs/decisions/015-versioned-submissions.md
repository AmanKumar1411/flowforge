# ADR 015: Submissions are versioned links, by any member, with an approved idea

**Status:** Accepted (Phase 7)

## Context

FlowForge's goal is that "students form teams, submit versioned work and receive private
evaluations". The cycle already has a submission window (`submissionStartAt` <
`submissionDeadline`). The team decided:

- a submission is **links and notes**: a repository URL (required), an optional demo and report
  link, and notes; no file uploads;
- **any team member** can submit, unlike ideas, which only the leader submits;
- submissions **close at the deadline**; there is no late work;
- a team needs an **approved or picked idea** before it can submit.

## Decision

- `Submission` rows are immutable versions: every save adds the next `version` (1, 2, 3…) for the
  team, and the newest is the current one. The newest before the deadline is therefore the final
  one, with no extra "final" flag.
- `SubmissionRules` (pure): the window is open while the cycle is published and
  `submissionStartAt <= now < submissionDeadline` (`409 SUBMISSION_NOT_OPEN` / `SUBMISSION_CLOSED`);
  the team's idea must be `APPROVED` (`409 IDEA_NOT_APPROVED`); the caller must be a member.
- Version numbers: the service locks the team row `FOR UPDATE`, reads the highest version and
  inserts the next one; two members saving at once take turns. The unique key `(teamId, version)`
  backs it up (`409 SUBMISSION_CHANGED` if it ever fires), and a CHECK keeps versions at 1 or more.
- The submission's `cycleId` is copied from the team and held equal to it by a composite foreign
  key to `Team (id, cycleId)`, like members and ideas. Teams with submissions cannot be deleted
  (`RESTRICT`); teams can only be disbanded before D1 anyway.
- A new `submissions` module reads teams, cycles and ideas only through `IdeaService`
  (`getTeamIdea`, `listForCycle`), so the visibility rules stay in one place: members, the owning
  faculty and admins read every version; the owning faculty and admins list the cycle's teams with
  their latest version. Every version is audited as `SUBMISSION_CREATED`.

## Alternatives considered

| Option | Why not |
| --- | --- |
| File uploads | Needs storage, size limits and download access control; the team chose links |
| Leader only | The team chose any member; each version records who submitted it |
| Late submissions, flagged | The team chose a hard close, like every other stage |
| Overwrite one submission row | Loses the history that "versioned work" asks for |
| An explicit "final" flag | The newest version before the deadline already is the final one |

## Consequences

- Evaluations (the next phase) can grade "the newest version before the deadline" without asking
  the team which one counts.
- Links can point to content that changes after the deadline (for example a repository's default
  branch). Teams should link to a release or commit for a version; FlowForge does not check it.
