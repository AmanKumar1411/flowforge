// Browser end-to-end check of the Phase 6 UI (idea deadline, batch lists, ideas and their review). See README.md.
// Usage: node ideas-ui.e2e.cjs <chrome path> <frontend url> <api url> <out dir>
const { chromium } = require("playwright-core");
const {
  DOMAIN,
  assert,
  createRun,
  devSignIn,
  apiSession,
  createCycleInWizard,
  localInput,
  openTab,
  plannedDates,
  openTeamPage,
} = require("./support.cjs");
const [chromePath, FRONTEND, API, OUT] = process.argv.slice(2);

// Batch 2027 belongs to this script alone.
const LEADER = `tara.n27csai${DOMAIN}`;
const REGISTERED = [`yash.b27csai${DOMAIN}`, `ira.d27csai${DOMAIN}`];

(async () => {
  const run = createRun(OUT, "ideas-browser-e2e");
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const fresh = () => browser.newContext();
  const sessions = [];
  const session = async (address, displayName) => {
    const created = await apiSession(API, FRONTEND, address, displayName);
    sessions.push(created);
    return created;
  };
  try {
    const admin = await session(`coordinator.x${DOMAIN}`, "Coordinator X");
    const allowlisted = await admin.call("POST", "/admin/faculty-allowlist", { email: `ritu.g${DOMAIN}` });
    assert([201, 409].includes(allowlisted.status), `allowlist: ${allowlisted.status}`);
    const facultyApi = await session(`ritu.g${DOMAIN}`, "Ritu G");
    const faculty = await devSignIn(await fresh(), FRONTEND, `ritu.g${DOMAIN}`, "Ritu G");
    const title = `Ideas ${Date.now()}`;
    let cycleId = "";

    await run.check("Faculty plan the project in the wizard; a milestone out of order is explained, publishing is confirmed", async () => {
      const plan = { teams: 1, ideas: 1, finalDays: 30 };
      cycleId = await createCycleInWizard(faculty, {
        courseName: "Product Studio",
        title,
        batchYear: 2027,
        minTeamSize: 1,
        maxTeamSize: 3,
        ...plan,
      });
      const expected = plannedDates(plan);
      // A milestone that opens before the idea deadline stops the step, with the reason in words.
      await faculty.goto(`${FRONTEND}/faculty/cycles/${cycleId}/edit?step=milestones`);
      await faculty.getByLabel("Submissions open").first().fill(localInput(expected.teamDeadline));
      await faculty.getByText(/M1: Opens before the idea deadline/).waitFor();
      await faculty.getByRole("button", { name: "Save and continue" }).click();
      await faculty.getByText("Fix the highlighted fields first.").waitFor();
      await faculty.getByLabel("Submissions open").first().fill(localInput(expected.opensAt));
      await faculty.getByRole("button", { name: "Save and continue" }).click();
      await faculty.getByRole("heading", { name: /Which ideas do you offer\?/ }).waitFor();
      await faculty.goto(`${FRONTEND}/faculty/cycles/${cycleId}/edit?step=review`);
      await faculty.getByText(/Teams fixed on/).waitFor();
      await faculty.getByRole("button", { name: "Publish to students" }).click();
      const dialog = faculty.getByRole("dialog", { name: "Publish to students?" });
      await dialog.getByText(/the details, team sizes and idea rules are fixed/).waitFor();
      await dialog.getByRole("button", { name: "Publish to students" }).click();
      await faculty.waitForURL(new RegExp(`/faculty/cycles/${cycleId}$`));
      const saved = (await facultyApi.call("GET", `/course-cycles/${cycleId}`)).body;
      assert(saved.status === "PUBLISHED", `status ${saved.status}`);
      assert(saved.teamDeadline === expected.teamDeadline.toISOString(), `teams ${saved.teamDeadline}`);
      assert(saved.ideaDeadline === expected.ideaDeadline.toISOString(), `ideas ${saved.ideaDeadline}`);
      assert(saved.minTeamSize === 1 && saved.maxTeamSize === 3, `sizes ${saved.minTeamSize}-${saved.maxTeamSize}`);
      return `cycle ${cycleId}`;
    }, faculty);

    await run.check("Faculty registers batch students who have not signed in yet", async () => {
      await faculty.reload();
      await openTab(faculty, "Students");
      await faculty.getByLabel("Batch student emails").fill([...REGISTERED, `tara.n26csai${DOMAIN}`].join("\n"));
      await faculty.getByRole("button", { name: "Register 3" }).click();
      await faculty.getByText("Registered 2 · already registered 0 · not added 1").waitFor();
      await faculty.getByText(`tara.n26csai${DOMAIN}: A student of batch 2026, not batch 2027`).waitFor();
      await faculty.getByText("Show all 2 students").click();
      const row = faculty.locator(".batch-list tbody tr", { hasText: "Yash B" });
      await row.getByText("Not signed in yet").waitFor();
    }, faculty);

    const leader = await devSignIn(await fresh(), FRONTEND, LEADER, "Tara");
    await leader.goto(`${FRONTEND}/student/cycles/${cycleId}`);
    let teamId = "";

    await run.check("A leader finds a registered student, tagged 'Not signed in yet', and adds them", async () => {
      await leader.getByRole("button", { name: "Create a team" }).click();
      await leader.getByLabel("Team name").fill("Nimbus");
      await leader.getByLabel("Find batch-mates").fill("yash");
      const result = leader.getByRole("list", { name: "Search results" }).getByRole("listitem").filter({ hasText: "Yash B" });
      await result.getByText("Not signed in yet").waitFor();
      await result.getByRole("button", { name: "Add" }).click();
      await leader.getByRole("button", { name: "Create team" }).click();
      await leader.locator(".team-panel").getByRole("heading", { name: "Nimbus" }).waitFor();
      teamId = (await (await session(LEADER, "Tara")).call("GET", "/teams/mine")).body[0].id;
    }, leader);

    await run.check("The leader writes and submits the team's idea", async () => {
      const panel = leader.locator(".team-panel", { has: leader.getByRole("heading", { name: "No idea yet" }) });
      await panel.getByText("As the leader, submit your team's idea by").waitFor();
      await panel.getByRole("button", { name: "Write our own idea" }).click();
      await leader.getByLabel("Idea title").fill("Room finder");
      await leader.getByLabel("Problem").fill("Free rooms are hard to find between classes.");
      await leader.getByLabel("Proposed solution").fill("A live map of free rooms from the timetable.");
      await leader.getByLabel("GitHub repository (optional)").fill("https://github.com/nimbus/room-finder");
      await leader.getByRole("button", { name: "Submit idea" }).click();
      await leader.getByRole("heading", { name: "Room finder" }).waitFor();
      await leader.locator(".idea-status", { hasText: "Waiting for review" }).waitFor();
    }, leader);

    await run.check("The registered student's first sign-in finds the team and the idea, read-only", async () => {
      const yash = await devSignIn(await fresh(), FRONTEND, REGISTERED[0], "Yash Bhatt");
      await yash.goto(`${FRONTEND}/student/cycles/${cycleId}`);
      await yash.locator(".team-panel").getByRole("heading", { name: "Nimbus" }).waitFor();
      await yash.getByRole("heading", { name: "Room finder" }).waitFor();
      await yash.getByText("Your leader can still change it until").waitFor();
      assert(await yash.getByRole("button", { name: "Edit idea" }).count() === 0, "a member can edit the idea");
    });

    await run.check("The leader changes the waiting idea; it becomes version 2", async () => {
      await leader.getByRole("button", { name: "Edit idea" }).click();
      await leader.getByLabel("Idea title").fill("Free room finder");
      await leader.getByRole("button", { name: "Save changes" }).click();
      await leader.getByRole("heading", { name: "Free room finder" }).waitFor();
      await leader.getByText(/Version 2, submitted by Tara/).waitFor();
    }, leader);

    await run.check("Faculty see the waiting idea and reject it with feedback", async () => {
      await faculty.goto(`${FRONTEND}/faculty/cycles/${cycleId}?tab=teams`);
      await faculty.locator(".team-row", { hasText: "Nimbus" }).getByText("Waiting for review").waitFor();
      await openTeamPage(faculty, "Nimbus");
      await faculty.getByText("A live map of free rooms from the timetable.").waitFor();
      await faculty.getByLabel("Reject").check();
      await faculty.getByLabel(/Feedback for the team/).fill("Timetables change weekly; show how you keep it current.");
      await faculty.getByRole("button", { name: "Reject idea" }).click();
      await faculty.getByText("Rejected the idea of Nimbus.").waitFor();
      await faculty.locator(".idea-status", { hasText: "Rejected" }).waitFor();
    }, faculty);

    await run.check("The leader sees the feedback, revises and resubmits", async () => {
      await leader.reload();
      await leader.locator(".idea-status", { hasText: "Rejected" }).waitFor();
      await leader.getByText("Timetables change weekly; show how you keep it current.").waitFor();
      await leader.getByRole("button", { name: "Revise and resubmit" }).click();
      await leader.getByLabel("Proposed solution").fill("A live map of free rooms, synced from the timetable feed every night.");
      await leader.getByRole("button", { name: "Resubmit idea" }).click();
      await leader.locator(".idea-status", { hasText: "Waiting for review" }).waitFor();
      await leader.getByText(/Version 3, submitted by Tara/).waitFor();
    }, leader);

    await run.check("Faculty approve the new version; the team sees it approved and final", async () => {
      // The one waiting proposal: the header's button opens its team.
      await faculty.goto(`${FRONTEND}/faculty/cycles/${cycleId}`);
      await faculty.getByRole("button", { name: "Review 1 proposal" }).click();
      await faculty.getByRole("heading", { level: 1, name: "Nimbus" }).waitFor();
      await faculty.getByText("Decision on version 3").waitFor();
      await faculty.getByRole("button", { name: "Approve idea" }).click();
      await faculty.getByText("Approved the idea of Nimbus.").waitFor();
      await leader.reload();
      await leader.locator(".idea-status", { hasText: "Approved" }).waitFor();
      await leader.getByText("This is your team's idea for this project.").waitFor();
      assert(await leader.getByRole("button", { name: /Edit idea|Revise/ }).count() === 0, "an approved idea can still change");
      const idea = (await facultyApi.call("GET", `/teams/${teamId}/idea`)).body.idea;
      assert(JSON.stringify(idea.reviews.map((entry) => entry.decision)) === '["APPROVED","REJECTED"]', `reviews ${JSON.stringify(idea.reviews)}`);
    }, leader);
  } finally {
    await Promise.all(sessions.map((created) => created.dispose()));
    await browser.close();
  }
  process.exit(run.finish() ? 1 : 0);
})();
