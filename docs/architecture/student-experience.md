# Student experience

## Journey

1. Sign in → `/student`, the dashboard (`GET /me/dashboard`, [ADR 021](../decisions/021-student-dashboard-read-model.md)):
   **Up next** (things to do, then dates), **Updates**, project cards, and a collapsed **Past**
   section ([ADR 022](../decisions/022-past-projects.md)).
2. A card or an up-next line opens `/student/projects/:id?tab=…`:
   - **Overview:** stage, phases, "What you need to do now" (leader-only actions shown to members
     as text, not buttons);
   - **Team**, **Idea** (with each version's feedback), **Milestones** (one card per milestone:
     details, links asked, versions, then the evaluation once released: "14 / 20", feedback,
     "Released on", "Updated on").
3. Closed projects show a read-only banner. Old links `/student/cycles/:id` open the same page
   with everything on one view (`?tab=all`).

## Access

| Who | Active projects | Closed projects | Evaluations |
| --- | --- | --- | --- |
| Student in a team | Published, own batch or enrolled | Read-only | Own team, released only |
| Batch-mate without a team | Published, own batch | Hidden (404) | — |
| Student of another batch | Hidden (404) | Hidden (404) | 404 |

## To-do rules (`StudentTodoRules`)

| Rule | When | Text |
| --- | --- | --- |
| `NoTeamWhileForming` | No team, before the team deadline | Create or join a team (by the deadline) |
| `IdeaDue` | In a team, no idea, before the idea deadline | Leader: submit or pick your team's idea; member: info |
| `RejectedIdea` | Idea rejected | Leader: revise your idea; member: info |
| `OpenMilestoneWithoutWork` | Approved idea, milestone open, nothing handed in | Submit M1 · name (by its due date) |

Adding a rule: one class implementing `TodoRule`, one `register` call in `withDefaults`.
