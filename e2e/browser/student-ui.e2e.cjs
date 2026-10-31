// Browser end-to-end check of the Phase 9 student side: dashboard, project tabs, idea feedback,
// milestone work, and private evaluations graded and released by the faculty. See README.md.
// Usage: node student-ui.e2e.cjs <chrome path> <frontend url> <api url> <out dir>
const { chromium } = require("playwright-core");
const { DOMAIN, assert, createRun, devSignIn, apiSession, cycleBody, openTab } = require("./support.cjs");
const [chromePath, FRONTEND, API, OUT] = process.argv.slice(2);

// Batch 2022 belongs to this script alone (completion-ui only enrolls a 2022 newcomer in its elective).
const FACULTY = `farah.q${DOMAIN}`;
const STUDENT = `mira.v22csai${DOMAIN}`;
const TEAM_S = 45;
const IDEAS_S = 75;
const DUE_S = 115;

(async () => {
  const run = createRun(OUT, "student-browser-e2e");
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const sessions = [];
  const session = async (email, name) => {
    const created = await apiSession(API, FRONTEND, email, name);
    sessions.push(created);
    return created;
  };
  const noSideScroll = async (page) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(overflow <= 0, `the page scrolls sideways by ${overflow}px`);
  };
  try {
    const admin = await session(`coordinator.x${DOMAIN}`, "Coordinator X");
    const allowlisted = await admin.call("POST", "/admin/faculty-allowlist", { email: FACULTY });
    assert([201, 409].includes(allowlisted.status), `allowlist: ${allowlisted.status}`);
    const facultyApi = await session(FACULTY, "Farah Q");
    await session(STUDENT, "Mira V");
    const t0 = Date.now();
    const at = (seconds) => new Date(t0 + seconds * 1000);
    const title = `Student journey ${t0}`;
    const created = await facultyApi.call(
      "POST",
      "/course-cycles",
      cycleBody(
        { courseName: "Software Design", title, batchYear: 2022, minTeamSize: 1, maxTeamSize: 3 },
        { teamDeadline: at(TEAM_S), ideaDeadline: at(IDEAS_S), opensAt: at(IDEAS_S), dueAt: at(DUE_S) },
      ),
    );
    assert(created.status === 201, `cycle: ${created.status} ${JSON.stringify(created.body)}`);
    const cycleId = created.body.id;
    const milestoneId = created.body.milestones[0].id;
    assert((await facultyApi.call("POST", `/course-cycles/${cycleId}/publish`)).status === 200, "publish");

    // A phone-sized student: every student screen is checked at 375px.
    const student = await devSignIn(await browser.newContext({ viewport: { width: 375, height: 812 } }), FRONTEND, STUDENT, "Mira V");
    let teamId = "";

    await run.check("The dashboard says what to do first and leads to the project's Team tab", async () => {
      await student.goto(`${FRONTEND}/student`);
      await student.getByRole("heading", { name: "Your projects" }).waitFor();
      const action = student.getByRole("link", { name: /^Create or join a team by / });
      await action.waitFor();
      await noSideScroll(student);
      await action.click();
      await student.waitForURL(new RegExp(`/student/projects/${cycleId}\\?tab=team$`));
      await student.getByRole("button", { name: "Create a team" }).click();
      await student.getByLabel("Team name").fill("Solo Falcon");
      await student.getByRole("button", { name: "Create team" }).click();
      await student.locator(".team-panel").getByRole("heading", { name: "Solo Falcon" }).waitFor();
      teamId = (await (await session(STUDENT, "Mira V")).call("GET", "/teams/mine")).body.find((team) => team.cycleId === cycleId).id;
    }, student);

    await run.check("The leader submits the idea; after a rejection the feedback shows and the idea is resubmitted", async () => {
      await openTab(student, "Idea");
      await student.getByRole("button", { name: "Write our own idea" }).click();
      await student.getByLabel("Idea title").fill("Seat finder");
      await student.getByLabel("Problem").fill("Nobody knows which library seats are free");
      await student.getByLabel("Proposed solution").fill("A live map");
      await student.getByRole("button", { name: "Submit idea" }).click();
      await student.locator(".idea-status", { hasText: "Waiting for review" }).waitFor();
      const rejected = await facultyApi.call("POST", `/teams/${teamId}/idea/review`, {
        version: 1,
        decision: "REJECTED",
        feedback: "Say where the seat data comes from.",
      });
      assert(rejected.status === 200, `reject: ${rejected.status}`);
      await student.reload();
      await student.getByText("Say where the seat data comes from.").waitFor();
      await student.getByRole("button", { name: "Revise and resubmit" }).click();
      await student.getByLabel("Proposed solution").fill("A live map fed by the gate sensors");
      await student.getByRole("button", { name: "Resubmit idea" }).click();
      await student.locator(".idea-status", { hasText: "Waiting for review" }).waitFor();
      assert((await facultyApi.call("POST", `/teams/${teamId}/idea/review`, { version: 2, decision: "APPROVED" })).status === 200, "approve");
      await noSideScroll(student);
    }, student);

    await run.check("Once M1 opens, the team submits it from the Milestones tab", async () => {
      await student.waitForTimeout(Math.max(0, t0 + (IDEAS_S + 1) * 1000 - Date.now()));
      await student.goto(`${FRONTEND}/student/projects/${cycleId}?tab=milestones`);
      await student.getByRole("button", { name: "Submit work" }).click();
      await student.getByLabel("GitHub repository").fill("https://github.com/solo-falcon/seat-finder");
      await student.getByRole("button", { name: "Submit version 1" }).click();
      await student.getByRole("heading", { name: /Version 1 submitted/ }).waitFor();
      await noSideScroll(student);
    }, student);

    const faculty = await devSignIn(await browser.newContext(), FRONTEND, FACULTY, "Farah Q");
    await run.check("After the due date the faculty give feedback and release it; the team sees it", async () => {
      await faculty.waitForTimeout(Math.max(0, t0 + (DUE_S + 1) * 1000 - Date.now()));
      // Before release the team sees that results are not out.
      await student.reload();
      await student.getByText(/Not released yet/).waitFor();
      await faculty.goto(`${FRONTEND}/faculty/cycles/${cycleId}?tab=milestones`);
      // Feedback only: this version has no marks or scale (H3). Rows are found by team, so other teams never match.
      const grading = faculty.getByRole("region", { name: "Grading of M1" });
      const row = grading.locator(".grading-row", { hasText: "Solo Falcon" });
      await grading.getByLabel("Feedback for Solo Falcon").fill("Clear plan; show the sensor data next.");
      await row.getByRole("button", { name: "Save" }).click();
      await row.getByRole("status").filter({ hasText: "Saved" }).waitFor();
      faculty.once("dialog", (dialog) => dialog.accept());
      await grading.getByRole("button", { name: "Release feedback to all teams" }).click();
      await grading.getByText(/^Released on /).waitFor();
      await student.reload();
      await student.getByText("Clear plan; show the sensor data next.").waitFor();
      await student.getByText(/^Feedback released on /).waitFor();
      assert((await student.locator(".evaluation-marks").count()) === 0, "no marks are shown");
    }, faculty);

    await run.check("A correction after release reaches the team as updated, and the dashboard says so", async () => {
      await faculty.reload();
      const grading = faculty.getByRole("region", { name: "Grading of M1" });
      const row = grading.locator(".grading-row", { hasText: "Solo Falcon" });
      await grading.getByLabel("Feedback for Solo Falcon").fill("Clear plan; show the sensor data and its tests next.");
      await row.getByRole("button", { name: "Save" }).click();
      await row.getByRole("status").filter({ hasText: "Saved" }).waitFor();
      await student.reload();
      await student.getByText("Clear plan; show the sensor data and its tests next.").waitFor();
      await student.getByText(/^Updated on /).waitFor();
      await student.goto(`${FRONTEND}/student`);
      await student.getByRole("link", { name: "Your result for M1 · Final submission was updated" }).waitFor();
      await noSideScroll(student);
      // The evaluation is private: an API call from another student of the batch finds nothing.
      const other = await session(`omar.h22csai${DOMAIN}`, "Omar H");
      const peek = await other.call("GET", `/course-cycles/${cycleId}/milestones/${milestoneId}/teams/${teamId}/evaluations`);
      assert(peek.status === 404, `another student: ${peek.status}`);
    }, student);
  } finally {
    await Promise.all(sessions.map((created) => created.dispose()));
    await browser.close();
  }
  process.exit(run.finish() ? 1 : 0);
})();
