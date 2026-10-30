# ADR 022: Closed projects stay readable to their former team members

**Status:** Accepted (Phase 9)

## Decision (S4)

A student reads a **closed** cycle only if they were in one of its teams; a batch-mate who never
joined a team does not see it (404). Past projects are listed under `projects.past` on the
dashboard, with their released results, and are read-only: every write is already refused by the
module rules once a cycle is closed (team formation, ideas, submissions).

## How

`CycleAuthorizationPolicy.canRead(actor, cycle, enrolled, formerMember)`. Membership comes from
teams through `CycleMembership`, a lookup the teams module provides on start-up (the same
extension-point pattern as `EnrollmentRemovalChecks`), so course-cycles never imports teams.

## Why

Students keep their own work, feedback and marks; nobody else gains access to a finished project.
