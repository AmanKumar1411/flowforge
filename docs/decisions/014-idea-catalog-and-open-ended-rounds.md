# ADR 014: Teams pick from the faculty's idea list or propose; feedback rounds have no deadline

**Status:** Accepted (Phase 7). Amends [ADR 013](013-project-ideas.md): a rejected idea is no longer
cut off when submissions open, and an idea can also come from the faculty's list.

## Context

The team described two ways faculty release projects:

1. The faculty publish a set of ideas and each team picks one.
2. A team proposes its own idea and the faculty approve it. This can take several rounds of
   feedback, so it may run past the idea deadline; only the **first** proposal must arrive before
   it. Once the faculty approve, the idea is final.

ADR 013 supported only the second way, and stopped resubmissions when submissions opened. The team
decided:

- both ways are available in the **same cycle**: the faculty may publish a list, and each team
  either picks from it or proposes its own;
- any number of teams can pick the same listed idea (**no limit**);
- after a rejection, revise-and-resubmit rounds continue with **no deadline** while the cycle is
  open.

## Decision

- `CatalogIdea` (title, description, optional http(s) link) belongs to a cycle. The owning faculty
  add, edit and remove ideas until the cycle closes (`409 CATALOG_CLOSED` after). Anyone who can see
  the cycle reads the list, with `pickCount` per idea.
- A **pick** (`POST /teams/:id/idea/pick`, leader only) saves the catalog idea as the team's idea,
  **approved at once** and therefore final: `source = CATALOG`, `catalogIdeaId` set, the
  description copied into `problem`, `solution` null. Copying means a later edit of the list never
  changes a team's project. It is audited as `IDEA_PICKED`.
- A pick is allowed exactly when a proposal could be saved (`IdeaRules.submissionAction`): as the
  first idea before the idea deadline, instead of a waiting proposal until then, or after a
  rejection. So the first idea, picked or proposed, is still due at D3.
- `IdeaRules.isResubmissionOpen` is now "the cycle is published": rounds after a rejection have no
  deadline. Closing the cycle ends them (`409 IDEA_RESUBMISSION_CLOSED`). A waiting proposal can
  still change only until D3; after that it changes only in answer to feedback.
- A picked idea cannot be removed from the list (`409 CATALOG_IDEA_PICKED`). The pick locks the
  catalog row `FOR SHARE`, and a composite foreign key `ProjectIdea (catalogIdeaId, cycleId)` →
  `CatalogIdea (id, cycleId)` with `RESTRICT` means a removal racing a pick fails, and a team can
  pick only from its own cycle's list.
- A CHECK ties the columns together: a pick names its catalog idea and is approved; a proposal has
  a solution and no catalog idea.

## Alternatives considered

| Option | Why not |
| --- | --- |
| One way per cycle (list **or** proposals) | The team wanted both in one cycle |
| A team limit per listed idea | Declined: any number of teams can pick the same idea |
| Faculty confirm each pick | The faculty already chose these ideas by listing them; a confirmation adds a round for nothing *(assumed; to confirm with the team)* |
| Reference the catalog idea instead of copying it | An edit to the list would silently change projects teams already work on |
| Keep the cut-off at "submissions open" | The team: rounds take as long as the feedback takes |

## Consequences

- A team with a long proposal process may get approval late, leaving less time to submit work
  (submissions need an approved idea, ADR 015). Teams can switch to a listed idea after any
  rejection.
- A rejection can arrive after submissions close; the team can still revise until the cycle closes,
  but can no longer submit work. Faculty close the cycle to end it.
