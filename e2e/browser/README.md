# Browser end-to-end checks

Three scripts drive the real React app in headless Chrome against the real API:

- `auth-ui.e2e.cjs` (Phase 3) runs 20 checks: the Google redirect (state, nonce, PKCE), token
  storage, single-flight refresh, the student / pending staff / admin / faculty journeys,
  deactivation, and sign out on one or every device.
- `teams-ui.e2e.cjs` (Phase 4) runs 11 checks:
  - team rules in the cycle editor, and extending the deadline of a published cycle;
  - creating a team with the size counter, and the added member seeing it without acting;
  - "already in a team" in another leader's search;
  - swapping a member, the faculty's team table, disbanding;
  - a team fixed after its deadline.
- `completion-ui.e2e.cjs` (Phase 5) runs 11 checks:
  - creating an elective in the editor, enrolling students by pasted emails and by CSV, and only
    enrolled students seeing it;
  - "Looking for a team" with a note, seen by a leader;
  - after the students' deadline: the student told the faculty will place them, the faculty's list
    of students without a team, a faculty-built team with a chosen leader, adding a student to a
    team with room;
  - auto-group preview, re-roll and confirmation, and the auto-grouped student seeing their team.
  It waits 45 seconds for a formation deadline to pass.

The Phase 4 and Phase 5 scripts set up their faculty member and students through the API, so all
three run one after another on the same database. Each owns a batch, so their counts never mix:
`auth-ui` uses 2023 (its batch-correction check moves a student to 2025), `teams-ui` 2026 and
`completion-ui` 2024. Shared helpers (dev sign-in, API sessions, dates) are in `support.cjs`.

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
```

To keep a development frontend on 5173 running, start this one on another port (for example
`npx vite --port 5174`), start the API with `FRONTEND_URL=http://localhost:5174`, and pass
`http://localhost:5174` to the scripts.

Each check prints `PASS` or `FAIL`. Results are written to `out/browser-e2e.json`,
`out/teams-browser-e2e.json` and `out/completion-browser-e2e.json`, with a screenshot of the page
for every failure. Each script exits with code 1 if any check fails.
