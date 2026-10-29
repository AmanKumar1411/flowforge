// Browser end-to-end check of the Phase 7 UI (the faculty's idea list, picks, rounds after a rejection, submissions). See README.md.
// Usage: node submissions-ui.e2e.cjs <chrome path> <frontend url> <api url> <out dir>
const { chromium } = require("playwright-core");
const {
  DOMAIN,
  assert,
  createRun,
  devSignIn,
  apiSession,
  openSection,
  openTeamPage,
} = require("./support.cjs");
const [chromePath, FRONTEND, API, OUT] = process.argv.slice(2);

// Batch 2021 belongs to this script alone.
const LEADER = `uma.r21csai${DOMAIN}`;
const MEMBER = `dev.k21csai${DOMAIN}`;
const PROPOSER = `isha.p21csai${DOMAIN}`;
// Ideas are due this many seconds after the cycle is created; submissions open a few seconds later.
const IDEAS_DUE_S = 50;
const SUBMISSIONS_OPEN_S = 55;

(async () => {
  const run = createRun(OUT, "submissions-browser-e2e");
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
    const allowlisted = await admin.call("POST", "/admin/faculty-allowlist", { email: `meera.j${DOMAIN}` });
    assert([201, 409].includes(allowlisted.status), `allowlist: ${allowlisted.status}`);
    const facultyApi = await session(`meera.j${DOMAIN}`, "Meera J");

    const t0 = Date.now();
    const at = (seconds) => new Date(t0 + seconds * 1000).toISOString();
    const created = await facultyApi.call("POST", "/course-cycles", {
      courseName: "Capstone",
      title: `Submissions ${t0}`,
      batchYear: 2021,
      semester: 7,
      academicYear: "2026-27",
      submissionStartAt: at(SUBMISSIONS_OPEN_S),
      submissionDeadline: at(30 * 24 * 60 * 60),
      minTeamSize: 1,
      maxTeamSize: 3,
      teamFormationDeadline: at(IDEAS_DUE_S),
      ideaDeadline: at(IDEAS_DUE_S),
    });
    assert(created.status === 201, `cycle: ${created.status} ${JSON.stringify(created.body)}`);
    const cycleId = created.body.id;
    assert((await facultyApi.call("POST", `/course-cycles/${cycleId}/publish`)).status === 200, "publish");

    // Two teams through the API: Orbit (Uma leads, Dev is a member) and Comet (Isha, who proposes).
    const leaderApi = await session(LEADER, "Uma");
    const memberApi = await session(MEMBER, "Dev");
    const proposerApi = await session(PROPOSER, "Isha");
    const memberId = (await memberApi.call("GET", "/auth/me")).body.id;
    const orbit = await leaderApi.call("POST", `/course-cycles/${cycleId}/teams`, { name: "Orbit", memberIds: [memberId] });
    assert(orbit.status === 201, `orbit: ${orbit.status}`);
    const comet = await proposerApi.call("POST", `/course-cycles/${cycleId}/teams`, { name: "Comet", memberIds: [] });
    assert(comet.status === 201, `comet: ${comet.status}`);
    const proposal = await proposerApi.call("PUT", `/teams/${comet.body.id}/idea`, {
      title: "Canteen queue",
      problem: "Lunch queues are long",
      solution: "Order ahead from the app",
    });
    assert(proposal.status === 200, `proposal: ${proposal.status}`);

    const faculty = await devSignIn(await fresh(), FRONTEND, `meera.j${DOMAIN}`, "Meera J");
    await faculty.goto(`${FRONTEND}/faculty/cycles/${cycleId}`);
    const catalog = faculty.locator("section", { has: faculty.locator("#catalog-heading") });

    await run.check("Faculty add ideas to the cycle's list, and remove one nobody picked", async () => {
      await openSection(faculty, "Idea list");
      for (const [title, description] of [
        ["Library seat finder", "Show which library seats are free right now"],
        ["Bus tracker", "Live campus bus positions"],
      ]) {
        await catalog.getByRole("button", { name: "+ Add an idea" }).click();
        await catalog.getByLabel("Idea title").fill(title);
        await catalog.getByLabel("Description").fill(description);
        await catalog.getByRole("button", { name: "Add idea" }).click();
        await catalog.getByText(title, { exact: true }).waitFor();
      }
      await catalog.getByRole("heading", { name: "2 ideas offered" }).waitFor();
      await catalog.getByRole("button", { name: "Remove Bus tracker" }).click();
      await catalog.getByRole("heading", { name: "1 idea offered" }).waitFor();
    }, faculty);

    const leader = await devSignIn(await fresh(), FRONTEND, LEADER, "Uma");
    await leader.goto(`${FRONTEND}/student/cycles/${cycleId}`);

    await run.check("The leader picks an idea from the list after confirming; it is approved at once", async () => {
      const list = leader.getByRole("list", { name: "Ideas from your faculty" });
      await list.getByText("Show which library seats are free right now").waitFor();
      await list.getByRole("button", { name: "Pick Library seat finder" }).click();
      await list.getByRole("button", { name: "Confirm: make it our project" }).click();
      await leader.locator(".idea-status", { hasText: "Picked from the list" }).waitFor();
      await leader.getByText("Picked from your faculty's list. This is your team's project for the cycle.").waitFor();
    }, leader);

    await run.check("Faculty see the pick, and a picked idea can no longer be removed", async () => {
      await faculty.reload();
      await openSection(faculty, "Idea list");
      await catalog.getByText("Picked by 1 team", { exact: true }).waitFor();
      assert(await catalog.getByRole("button", { name: "Remove Library seat finder" }).count() === 0, "a picked idea can be removed");
    }, faculty);

    const rejected = await facultyApi.call("POST", `/teams/${comet.body.id}/idea/review`, {
      version: 1,
      decision: "REJECTED",
      feedback: "Say who orders and how they pay.",
    });
    assert(rejected.status === 200, `reject: ${rejected.status}`);
    // Past the idea deadline and into the submission window.
    await faculty.waitForTimeout(Math.max(0, t0 + (SUBMISSIONS_OPEN_S + 1) * 1000 - Date.now()));

    const proposer = await devSignIn(await fresh(), FRONTEND, PROPOSER, "Isha");
    await run.check("After submissions open, a rejected team can still revise; until approved it cannot submit", async () => {
      await proposer.goto(`${FRONTEND}/student/cycles/${cycleId}`);
      await proposer.getByText("there is no deadline for these rounds").waitFor();
      await proposer.getByText("Your team can submit once its idea is approved or picked").waitFor();
      await proposer.getByRole("button", { name: "Revise and resubmit" }).click();
      await proposer.getByLabel("Proposed solution").fill("Students order ahead and pay with their campus card");
      await proposer.getByRole("button", { name: "Resubmit idea" }).click();
      await proposer.locator(".idea-status", { hasText: "Waiting for review" }).waitFor();
      assert(await proposer.getByRole("button", { name: "Submit work" }).count() === 0, "submit shown before approval");
      const approved = await facultyApi.call("POST", `/teams/${comet.body.id}/idea/review`, { version: 2, decision: "APPROVED" });
      assert(approved.status === 200, `approve: ${approved.status}`);
      await proposer.reload();
      await proposer.getByRole("button", { name: "Submit work" }).waitFor();
    }, proposer);

    const member = await devSignIn(await fresh(), FRONTEND, MEMBER, "Dev");
    await run.check("A member (not the leader) submits the first version", async () => {
      await member.goto(`${FRONTEND}/student/cycles/${cycleId}`);
      await member.getByRole("button", { name: "Submit work" }).click();
      await member.getByLabel("Repository URL").fill("https://github.com/orbit/seat-finder");
      await member.getByLabel("Notes (optional)").fill("Seat map from the gate sensors");
      await member.getByRole("button", { name: "Submit version 1" }).click();
      await member.getByRole("heading", { name: "Version 1 submitted" }).waitFor();
      await member.getByRole("list", { name: "Submitted versions" }).getByText("Seat map from the gate sensors").waitFor();
    }, member);

    await run.check("The leader submits version 2; the links carry over", async () => {
      await leader.reload();
      await leader.getByRole("button", { name: "Submit a new version" }).click();
      assert((await leader.getByLabel("Repository URL").inputValue()) === "https://github.com/orbit/seat-finder", "repository not carried over");
      await leader.getByLabel("Demo URL (optional)").fill("https://orbit.example.edu");
      await leader.getByRole("button", { name: "Submit version 2" }).click();
      await leader.getByRole("heading", { name: "Version 2 submitted" }).waitFor();
      const versions = leader.getByRole("list", { name: "Submitted versions" }).getByRole("listitem");
      assert(await versions.count() === 2, `versions: ${await versions.count()}`);
    }, leader);

    await run.check("Faculty see each team's latest version and its history", async () => {
      await faculty.reload();
      await faculty.locator(".glance", { hasText: "1 of 2 teams submitted" }).waitFor();
      await faculty.locator(".team-row", { hasText: "Orbit" }).getByText("2 submissions").waitFor();
      await openTeamPage(faculty, "Orbit");
      const work = faculty.getByRole("list", { name: "Submitted versions" });
      await work.getByText("Version 2").waitFor();
      await work.getByText("Version 1").waitFor();
      // Submissions are still open, so the newest version is marked as the latest, not yet final.
      await work.locator("li").first().locator(".final-tag", { hasText: "Latest" }).waitFor();
      const rows = (await facultyApi.call("GET", `/course-cycles/${cycleId}/submissions`)).body;
      const orbitRow = rows.find((row) => row.team.name === "Orbit");
      assert(orbitRow.versionCount === 2 && orbitRow.latest.demoUrl === "https://orbit.example.edu", JSON.stringify(orbitRow));
    }, faculty);
  } finally {
    await Promise.all(sessions.map((created) => created.dispose()));
    await browser.close();
  }
  process.exit(run.finish() ? 1 : 0);
})();
