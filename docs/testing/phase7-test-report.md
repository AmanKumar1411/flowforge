# Phase 7 test report: the faculty's idea list, open-ended rounds and submissions

**Date:** 2026-10-28 · **Branch:** `phase7-submissions` (from `4feb9dd`, uncommitted) · **Environment:**
macOS, Node 22.14, PostgreSQL in Docker (`flowforge_test`), headless Google Chrome

## Result

**All 909 tests and checks pass. Every earlier test still passes, after the changes listed under
[Tests changed by new behaviour](#tests-changed-by-new-behaviour).** Build, typecheck, lint and the
migration checks pass in both apps. `npm audit` reports 0 vulnerabilities in the frontend, and 6
low-severity ones in the backend's test tooling (see [npm audit](#npm-audit)).

| Layer | Runner | What it exercises | Passed | Time |
| --- | --- | --- | ---: | ---: |
| Unit | Jest | Domain rules, policies, services with in-memory doubles | **366 / 366** (337 in Phase 6) | 15 s |
| Integration | `node:test` + real PostgreSQL | Full HTTP API through the real Nest app | **485 / 485** (418 in Phase 6) | 59 s |
| Browser end-to-end | Chrome via `playwright-core` | Real React app against the real API | **58 / 58** (20 sign-in, 11 teams, 11 completion, 9 ideas, 7 submissions) | 130 s, with two deadline waits |
| **Total** | | | **909 / 909** | |

| Gate | Result |
| --- | --- |
| Backend `build`, `typecheck` (including tests), `lint` | Pass |
| `prisma validate`; `prisma migrate status` (7 migrations, dev and test databases) | Valid, up to date |
| Migration drift (`prisma migrate diff` from the database to the schema) | Empty |
| Frontend `build`, `lint` | Pass |
| `npm audit` | Frontend 0; backend 6 low, test tooling only |

## Requirement traceability

| Requirement (agreed with the team) | Covered by | Result |
| --- | --- | --- |
| Faculty publish an idea list per cycle; students, faculty and admins of the cycle read it; only the owner changes it, until the cycle closes | `idea-rules.spec.ts`; `idea.service.spec.ts` (catalog); Integration: the faculty's catalog; RBAC matrix; Browser submissions check 1 | Pass |
| In the same cycle a team picks from the list **or** proposes its own idea | Integration: picks and proposals in one cycle; Browser submissions checks 2 and 4 | Pass |
| Any number of teams pick the same idea; the list shows how many did | `idea.service.spec.ts`; Integration (2 teams, `pickCount` 2); Browser submissions check 3 | Pass |
| A pick is approved at once and final; only the leader picks; the team keeps its copy when the list is edited | `idea-rules.spec.ts`; `idea.service.spec.ts`; Integration; Browser submissions check 2 | Pass |
| A picked idea cannot be removed; picks come only from the team's own cycle | `idea-rules.spec.ts`; Integration (409 `CATALOG_IDEA_PICKED`, composite foreign key refuses a foreign pick); Browser submissions check 3 | Pass |
| The first idea, picked or proposed, is due at the idea deadline | `idea.service.spec.ts`; Integration: no late first idea | Pass |
| After a rejection, rounds continue with no deadline until the cycle closes | `idea-rules.spec.ts`; `idea.service.spec.ts`; Integration: rounds after submissions open and close; Browser submissions check 4 | Pass |
| Submissions are links and notes; repository URL required, http(s) only | `submission-rules.spec.ts`; Integration: link and notes checks | Pass |
| Any member submits; every save is a new version; members, owner and admins read every version | `submission.service.spec.ts`; Integration; RBAC matrix; Browser submissions checks 5–6 | Pass |
| Open from "submissions open" until the deadline; closed after it and when the cycle closes; earlier versions stay | `submission-rules.spec.ts`; `submission.service.spec.ts`; Integration | Pass |
| A team needs an approved or picked idea to submit | `submission-rules.spec.ts`; Integration (waiting, none, picked); Browser submissions check 4 | Pass |
| Versions stay 1, 2, 3 when members submit at once; the database refuses duplicates, version 0 and a foreign cycle | Integration: three members at once, raw SQL inserts | Pass |
| Faculty and admins list every team with its idea and latest version | `submission.service.spec.ts`; Integration; Browser submissions check 7 | Pass |
| Every change is audited (catalog, pick, submission) | Unit and integration audit assertions | Pass |

## Cycle editor: a simpler schedule

Faculty found the cycle editor's dates confusing. The two submission dates came first, the three
team and idea dates came later in a separate box, every date started at "now", and skipping the
faculty's own window meant entering the same date twice. A wrong order was reported only after
saving, for example "Team formation must end by the time submissions open". The rules did not
change; the form did (`CycleEditorPage.tsx`, `schedule.ts`):

- One **Schedule** section with three numbered steps in the order they happen (teams, project
  ideas, project work), each with one sentence on what happens and the team sizes inside step 1.
- The faculty's placing window is a checkbox ("Give me time after that to place students who are
  still without a team"); its date appears only when ticked, and unticking ends it with the
  students' deadline as before.
- New cycles start with a valid schedule (teams in a week, ideas a week later, submissions open
  the next morning for a month), so faculty adjust dates instead of building the order.
- Each date is checked as it changes, with the conflicting date named ("Must be on or after the
  idea deadline (11 Nov 2026, 23:59)"); "Create draft" stays disabled until the schedule is in
  order, and a one-line summary describes the plan once it is.
- The old hint still said a rejected idea could be resubmitted only until submissions open; the
  new text follows ADR 014.

## Bugs found and fixed during the phase

| # | Where | Bug | Fix |
| --- | --- | --- | --- |
| 1 | Faculty submissions table | The links cell used `display: flex`, so its links left their row and sat above it. | The links are wrapped in a `div` inside the cell. |
| 2 | Every table with a buttons column (enrollment, ideas, submissions; from earlier phases) | `td.row-actions` was a flex box, which detached the cell from its row's borders; visible as offset lines next to "View" or "Close". | `td.row-actions` stays a table cell and right-aligns its buttons (`App.css`). |

Both were found by checking screenshots of the new screens; no automated check failed on them.

## Tests changed by new behaviour

| Test | Why it changed |
| --- | --- |
| `idea-rules.spec.ts`: "a rejected idea once submissions are open" | Moved from refused to allowed; rounds after a rejection have no deadline (ADR 014). |
| `idea.service.spec.ts`: "ends resubmission when submissions open" | Replaced by "keeps the rounds going after submissions open and close, until the cycle closes". |
| Integration `ideas.e2e.ts`: "keeps a rejection final once submissions are open" | Replaced by "keeps the feedback rounds going after submissions open and close". |
| Browser `ideas-ui` check 4 | The leader's button is now "Write our own idea", next to the faculty's list. |
| Browser `auth-ui`, `teams-ui`, `completion-ui` (cycle creation) and `teams-ui` check 2 | The editor's date labels changed ("Students form teams until", "Ideas due by", "Submissions open", "Final submission deadline"); `auth-ui` now relies on the default schedule; `completion-ui` ticks the placing checkbox. |
| Browser `ideas-ui` check 1 | Later dates no longer start equal to the formation deadline, so the check now covers the live warning: a date out of order is named and "Create draft" stays disabled until it is fixed. |

## npm audit

A new advisory (GHSA-gcqx-w48m-w2h4, prototype poisoning in `deepmerge`) appeared after the Phase 6
report. `deepmerge` is used by `jest-config`, so the 6 findings are all in the backend's test
tooling (Jest and ts-jest); nothing in the running app uses it. Every `deepmerge` version from
4.2.0 on is affected, and npm's only offer is downgrading Jest to version 25, which would break
the test setup. Left as is until Jest ships a fixed dependency.

## Not covered yet

- Admins have no cycle page in the UI; their read-only access to ideas, the list and submissions is
  tested through the API only.
- Submitted links can change after the deadline (for example a repository's default branch).
- Assumptions to confirm with the team (ADR 014): a pick is approved and final at once, only the
  leader picks, and a waiting or rejected proposal can be swapped for a pick.

## How to run

- Unit and integration: in `backend/`, `npm test` and `npm run test:integration`.
- Browser: see the [e2e README](../../e2e/browser/README.md); run the five scripts in order on an
  empty `flowforge_test`.
