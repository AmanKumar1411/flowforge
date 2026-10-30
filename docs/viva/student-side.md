# Viva notes: the student side (Phase 9)

| Feature | Decision | Pattern | Proving test | A live change to try |
| --- | --- | --- | --- | --- |
| Private evaluations | One per team per milestone; hidden until released | Policy + SQL filter + 404 | `evaluations.e2e.ts` privacy matrix | Per-member marks: an `EvaluationMember` child row, a `marks` column per member, the same policy |
| Release | Per milestone, all teams, one-way | State in `MilestoneGrading.releasedAt`, conditional update | `evaluation-rules.spec.ts`, release e2e | "Unrelease" for 10 minutes: one rule in `assertCanRelease` |
| Corrections | Every save a version; "Updated" after release | Append-only revisions + optimistic concurrency | Concurrent saves e2e (one 200, one 409) | Show the revision history to the owner: one repository read |
| Dashboard | Computed read model, no tables | Composition through one port; Strategy registry for to-dos | `student-todo-rules.spec.ts`, `dashboard.e2e.ts` (equal query count) | A rule "M2 opens tomorrow": one class, one `register` call |
| Past projects | Readable to former members only | Extension point (`CycleMembership`) like removal checks | `cycle-authorization-policy.spec.ts`, dashboard e2e | Let admins hide a past project: one field and one policy line |
| Equal deadlines (S5) | `teamDeadline <= ideaDeadline` | Pure `MilestoneSchedule` rule | `milestone-schedule.spec.ts` | — |
