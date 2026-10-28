// Browser end-to-end check of the Phase 6 UI (idea deadline, batch lists, ideas and their review). See README.md.
// Usage: node ideas-ui.e2e.cjs <chrome path> <frontend url> <api url> <out dir>
const { chromium } = require("playwright-core");
const {
  DOMAIN,
  assert,
  createRun,
  devSignIn,
  apiSession,
  localInput,
  minuteFromNow,
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

    await run.check("Faculty set the schedule step by step; a date out of order is explained before saving", async () => {
      await faculty.getByRole("button", { name: "+ New cycle" }).click();
      await faculty.getByLabel("Course name").fill("Product Studio");
      await faculty.getByLabel("Cycle title").fill(title);
      await faculty.getByLabel("Batch year").fill("2027");
      await faculty.getByLabel("Academic year").fill("2026-27");
      await faculty.getByLabel("Minimum team size").fill("1");
      await faculty.getByLabel("Maximum team size").fill("3");
      const formation = minuteFromNow(24 * 60);
      const ideas = minuteFromNow(2 * 24 * 60);
      // No faculty window: the completion deadline stays with the formation deadline.
      await faculty.getByLabel("Students form teams until").fill(localInput(formation));
      // Submissions opening before the default idea deadline (two weeks out) is flagged at once.
      await faculty.getByLabel("Submissions open").fill(localInput(minuteFromNow(3 * 24 * 60)));
      await faculty.getByText(/Must be on or after the idea deadline/).waitFor();
      assert(await faculty.getByRole("button", { name: "Create draft" }).isDisabled(), "create is enabled with a date out of order");
      await faculty.getByLabel("Ideas due by").fill(localInput(ideas));
      assert(await faculty.getByText(/Must be on or after/).count() === 0, "the problem did not clear");
      await faculty.getByLabel("Final submission deadline").fill(localInput(minuteFromNow(30 * 24 * 60)));
      await faculty.getByText(/Students form teams until .*, and teams get \d+ days to submit their work/).waitFor();
      await faculty.getByRole("button", { name: "Create draft" }).click();
      await faculty.waitForURL(/\/faculty\/cycles\/[0-9a-f-]{36}$/);
      cycleId = faculty.url().split("/").pop();
      await faculty.locator(".info-block", { hasText: "Ideas due" }).waitFor();
      const saved = (await facultyApi.call("GET", `/course-cycles/${cycleId}`)).body;
      assert(saved.teamCompletionDeadline === formation.toISOString(), `completion ${saved.teamCompletionDeadline}`);
      assert(saved.ideaDeadline === ideas.toISOString(), `ideas ${saved.ideaDeadline}`);
      assert((await facultyApi.call("POST", `/course-cycles/${cycleId}/publish`)).status === 200, "publish");
      return `cycle ${cycleId}`;
    }, faculty);

    await run.check("Faculty registers batch students who have not signed in yet", async () => {
      await faculty.reload();
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
