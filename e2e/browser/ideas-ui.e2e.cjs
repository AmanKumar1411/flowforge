// Browser end-to-end check of the Phase 6 UI (idea deadline, batch lists, ideas and their review). See README.md.
// Usage: node ideas-ui.e2e.cjs <chrome path> <frontend url> <api url> <out dir>
const { chromium } = require("playwright-core");
const {
  DOMAIN,
  assert,
  createRun,
  devSignIn,
  apiSession,
  dayFromToday,
  plannedDates,
  openSection,
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

    await run.check("Faculty plan the cycle in the wizard; a deadline out of order is explained, publishing is confirmed", async () => {
      await faculty.getByRole("button", { name: "+ New cycle" }).click();
      await faculty.getByLabel("Course name").fill("Product Studio");
      await faculty.getByLabel("Cycle title").fill(title);
      await faculty.getByLabel("Batch year").fill("2027");
      await faculty.getByRole("button", { name: "Next: Teams" }).click();
      await faculty.getByLabel("Allow solo projects").check();
      await faculty.getByLabel("Maximum team size").fill("3");
      await faculty.getByRole("button", { name: "Next: Timeline" }).click();
      const plan = { teams: 1, ideas: 1, finalDays: 30 };
      await faculty.getByLabel("Days to form teams").fill("1");
      await faculty.getByLabel("Days for ideas").fill("1");
      // A final deadline before submissions open stops the step, with the reason in words.
      await faculty.getByLabel("Final deadline").fill(dayFromToday(2));
      await faculty.getByRole("button", { name: "Next: Review" }).click();
      await faculty.getByText(/The final deadline is before submissions open/).waitFor();
      await faculty.getByText("One thing needs fixing on this step.").waitFor();
      await faculty.getByLabel("Final deadline").fill(dayFromToday(plan.finalDays));
      await faculty.getByRole("button", { name: "Next: Review" }).click();
      await faculty.getByText(/Batch 2027 students work alone or form teams of up to 3 until/).first().waitFor();
      await faculty.getByRole("button", { name: "Publish to students" }).click();
      const dialog = faculty.getByRole("dialog", { name: "Publish to students?" });
      await dialog.getByText(/the team sizes, and whether you keep extra time/).waitFor();
      await dialog.getByRole("button", { name: "Publish to students" }).click();
      await faculty.waitForURL(/\/faculty\/cycles\/[0-9a-f-]{36}$/);
      cycleId = faculty.url().split("/").pop();
      const saved = (await facultyApi.call("GET", `/course-cycles/${cycleId}`)).body;
      const expected = plannedDates(plan);
      assert(saved.status === "PUBLISHED", `status ${saved.status}`);
      // No faculty window: the completion deadline stays with the students' deadline.
      assert(saved.teamCompletionDeadline === expected.teamFormationDeadline, `completion ${saved.teamCompletionDeadline}`);
      assert(saved.ideaDeadline === expected.ideaDeadline, `ideas ${saved.ideaDeadline}, expected ${expected.ideaDeadline}`);
      assert(saved.minTeamSize === 1 && saved.maxTeamSize === 3, `sizes ${saved.minTeamSize}-${saved.maxTeamSize}`);
      return `cycle ${cycleId}`;
    }, faculty);

    await run.check("Faculty registers batch students who have not signed in yet", async () => {
      await faculty.reload();
      await openSection(faculty, "Students");
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
      await leader.getByLabel("Link (optional)").fill("https://github.com/nimbus/room-finder");
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
      await faculty.reload();
      await openSection(faculty, "Ideas");
      const ideas = faculty.locator(".team-panel", { has: faculty.getByRole("heading", { name: "1 waiting for review" }) });
      await ideas.getByRole("button", { name: "Open the idea of Nimbus" }).click();
      const review = faculty.getByLabel("Idea of Nimbus");
      await review.getByText("A live map of free rooms from the timetable.").waitFor();
      await review.getByLabel("Reject").check();
      await review.getByLabel(/Feedback for the team/).fill("Timetables change weekly; show how you keep it current.");
      await review.getByRole("button", { name: "Reject idea" }).click();
      await faculty.getByText("Rejected the idea of Nimbus.").waitFor();
      await faculty.getByRole("heading", { name: "0 waiting for review" }).waitFor();
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
      await faculty.reload();
      await openSection(faculty, "Ideas");
      await faculty.getByRole("button", { name: "Open the idea of Nimbus" }).click();
      const review = faculty.getByLabel("Idea of Nimbus");
      await review.getByText("Decision on version 3").waitFor();
      await review.getByRole("button", { name: "Approve idea" }).click();
      await faculty.getByText("Approved the idea of Nimbus.").waitFor();
      await leader.reload();
      await leader.locator(".idea-status", { hasText: "Approved" }).waitFor();
      await leader.getByText("This is your team's project for the cycle.").waitFor();
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
