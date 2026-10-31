# Browser end-to-end checks

Six scripts drive the real React app in headless Chrome against the real API:

- `auth-ui.e2e.cjs` (Phase 3) runs 20 checks: the Google redirect (state, nonce, PKCE), token
  storage, single-flight refresh, the student / pending staff / admin / faculty journeys,
  deactivation, and sign out on one or every device.
- `teams-ui.e2e.cjs` (Phase 4) runs 11 checks:
  - team rules in the cycle wizard, and extending the deadline of a published cycle in the same
    wizard, with what publishing locked shown as locked;
  - creating a team with the size counter, and the added member seeing it without acting;
  - "already in a team" in another leader's search;
  - swapping a member, the team in the faculty's teams list and on its page, disbanding;
  - a team fixed after its deadline.
- `completion-ui.e2e.cjs` (Phase 5) runs 11 checks:
  - creating an elective with extra placing time in the wizard, enrolling students by pasted
    emails and by CSV, and only
    enrolled students seeing it;
  - "Looking for a team" with a note, seen by a leader;
  - after the students' deadline: the student told the faculty will place them, the faculty's list
    of students without a team, a faculty-built team with a chosen leader, adding a student to a
    team with room;
  - auto-group preview, re-roll and confirmation, and the auto-grouped student seeing their team.
  It waits 45 seconds for a formation deadline to pass.
- `ideas-ui.e2e.cjs` (Phase 6) runs 9 checks:
  - planning the cycle in the wizard: a final deadline before submissions open is explained and
    stops the step, and publishing is confirmed in a dialog;
  - registering a core batch's students who have not signed in, and a leader adding one
    (tagged "Not signed in yet") who then finds the team at their first sign-in;
  - the leader submitting and editing the idea, the faculty rejecting it with feedback, the
    leader resubmitting, and the faculty approving the new version.
- `submissions-ui.e2e.cjs` (Phase 7) runs 7 checks:
  - the faculty adding ideas to the cycle's list and removing one nobody picked;
  - a leader picking an idea after confirming, and the faculty unable to remove it once picked;
  - a rejected team revising after submissions opened, and only submitting once approved;
  - a member submitting version 1, the leader version 2 (links carried over), and the faculty
    seeing each team's latest version and its history.
  It waits about 55 seconds for the idea deadline to pass and submissions to open.
- `cycles-ui.e2e.cjs` (Phase 8) runs 10 checks of the guided wizard and the project page:
  - setting up a project from blank, saved as a draft from the first step, that students cannot
    see; adding a Drive-only milestone, with an overlap flagged as it is typed, and publishing;
    an elective whose publish is blocked (no students), the review linking to the Students step,
    then published; a student seeing the stage and next event; starting a new project from a
    previous one, milestones included; the wizard with the keyboard alone at 375px wide;
  - the page's overview (phases with today, "Coming up", one primary action), its Teams and
    Milestones tabs; "Needs your attention" for a waiting idea, whose link opens that team's page;
    a draft's page sending the faculty to the review step; a closed project with nothing to do.
  `openTab` in `support.cjs` opens a tab of the project page, and `openTeamPage` opens a team's
  page from the teams list.

- `student-ui.e2e.cjs` (Phase 9, feedback only since Phase 10) runs 5 checks at 375px: the dashboard
  leading to the Team tab, an idea rejected then resubmitted, M1 submitted, the faculty giving feedback
  and releasing it (the team sees it, with no marks), and a correction shown as updated; another student
  gets 404. Batch 2022.

The Phase 4 to 7 scripts and `cycles-ui` set up their faculty member and students through the
API, so all six run one after another on the same database. Each owns a batch, so their counts never mix:
`auth-ui` uses 2023 (its batch-correction check moves a student to 2025), `teams-ui` 2026,
`completion-ui` 2024 (its elective's newcomer is in 2022), `ideas-ui` 2027, `submissions-ui`
2021 and `cycles-ui` 2020. `support.cjs` also holds `createCycleInWizard`, which walks the six wizard steps,
`plannedDates`, which computes the dates it fills in, and `cycleBody`, which builds a cycle for the API. Shared helpers
(dev sign-in, API sessions, dates) are in `support.cjs`.

It uses `playwright-core` with your installed Google Chrome, so nothing is downloaded and the app
gets no new dependency.

## Run it

Use the **test** database: the run creates users, and the integration tests empty that database.

```bash
# 1. API on port 3100 against flowforge_test, with a bootstrap admin
cd backend
DATABASE_URL=<your flowforge_test URL> PORT=3100 \
  ADMIN_BOOTSTRAP_EMAILS=coordinator.x@nst.rishihood.edu.in \
  GOOGLE_REDIRECT_URI=http://localhost:3100/api/auth/google/callback \
  AUTH_LOGIN_RATE_LIMIT_PER_MINUTE=1000 AUTH_REFRESH_RATE_LIMIT_PER_MINUTE=1000 \
  npx ts-node -T src/main.ts

# 2. Frontend on 5173 pointed at it, with the dev login form
cd frontend
VITE_API_BASE_URL=http://localhost:3100/api VITE_DEV_LOGIN=true npx vite --port 5173 --strictPort

# 3. The check (an empty flowforge_test database is expected)
cd e2e/browser
npm install --no-save playwright-core@1.64.1
node auth-ui.e2e.cjs "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  http://localhost:5173 http://localhost:3100/api ./out
node teams-ui.e2e.cjs "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  http://localhost:5173 http://localhost:3100/api ./out
node completion-ui.e2e.cjs "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  http://localhost:5173 http://localhost:3100/api ./out
node ideas-ui.e2e.cjs "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  http://localhost:5173 http://localhost:3100/api ./out
node submissions-ui.e2e.cjs "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  http://localhost:5173 http://localhost:3100/api ./out
node cycles-ui.e2e.cjs "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  http://localhost:5173 http://localhost:3100/api ./out
```

To keep a development frontend on 5173 running, start this one on another port (for example
`npx vite --port 5174`), start the API with `FRONTEND_URL=http://localhost:5174`, and pass
`http://localhost:5174` to the scripts.

Each check prints `PASS` or `FAIL`. Results are written to `out/browser-e2e.json`,
`out/teams-browser-e2e.json`, `out/completion-browser-e2e.json`, `out/ideas-browser-e2e.json`,
`out/submissions-browser-e2e.json` and `out/cycles-browser-e2e.json`,
with a screenshot of the page for every failure. Each script exits with code 1 if any check fails.
