// Browser end-to-end check of the cycle wizard and the cycle page (phases, primary action, attention, sections). See README.md.
// Usage: node cycles-ui.e2e.cjs <chrome path> <frontend url> <api url> <out dir>
const { chromium } = require("playwright-core");
const {
  DOMAIN,
  assert,
  createRun,
  devSignIn,
  apiSession,
  plannedDates,
  createCycleInWizard,
} = require("./support.cjs");
const [chromePath, FRONTEND, API, OUT] = process.argv.slice(2);

// Batch 2020 belongs to this script alone.
const FACULTY = `kavita.n${DOMAIN}`;
const STUDENT = `ravi.k20csai${DOMAIN}`;
const PARTNER = `neha.s20csai${DOMAIN}`;

(async () => {
  const run = createRun(OUT, "cycles-browser-e2e");
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const sessions = [];
  const session = async (address, displayName) => {
    const created = await apiSession(API, FRONTEND, address, displayName);
    sessions.push(created);
    return created;
  };
  try {
    const admin = await session(`coordinator.x${DOMAIN}`, "Coordinator X");
    const allowlisted = await admin.call("POST", "/admin/faculty-allowlist", { email: FACULTY });
    assert([201, 409].includes(allowlisted.status), `allowlist: ${allowlisted.status}`);
    const facultyApi = await session(FACULTY, "Kavita N");
    const studentApi = await session(STUDENT, "Ravi K");
    const faculty = await devSignIn(await browser.newContext(), FRONTEND, FACULTY, "Kavita N");
    const title = `Data Systems ${Date.now()}`;
    let cycleId = "";
    let copyId = "";

    await run.check("A first-time faculty member sets up a cycle from blank and saves a draft; students can't see it", async () => {
      cycleId = await createCycleInWizard(faculty, {
        courseName: "Data Systems",
        title,
        batchYear: 2020,
        minTeamSize: 2,
        maxTeamSize: 4,
      });
      const saved = (await facultyApi.call("GET", `/course-cycles/${cycleId}`)).body;
      const expected = plannedDates({ teams: 7, ideas: 7, finalDays: 45 });
      assert(saved.status === "DRAFT", `status ${saved.status}`);
      assert(saved.ideaDeadline === expected.ideaDeadline, `ideas ${saved.ideaDeadline}, expected ${expected.ideaDeadline}`);
      assert(saved.submissionStartAt === expected.submissionStartAt, `opens ${saved.submissionStartAt}`);
      const visible = (await studentApi.call("GET", "/course-cycles")).body;
      assert(!visible.some((cycle) => cycle.id === cycleId), "a student sees a draft");
      return `draft ${cycleId}`;
    }, faculty);

    await run.check("The same wizard edits the draft and publishes it after confirming what locks", async () => {
      await faculty.goto(`${FRONTEND}/faculty/cycles/${cycleId}/edit`);
      await faculty.getByText("Edit draft").waitFor();
      await faculty.getByRole("button", { name: "Next: Teams" }).click();
      await faculty.getByRole("button", { name: "Next: Timeline" }).click();
      await faculty.getByLabel("Days for ideas").fill("10");
      await faculty.getByRole("button", { name: "Next: Review" }).click();
      await faculty.getByRole("button", { name: "Publish to students" }).click();
      const dialog = faculty.getByRole("dialog", { name: "Publish to students?" });
      await dialog.getByText("Students of batch 2020 will see this cycle").waitFor();
      await dialog.getByText(/the date submissions open/).waitFor();
      await dialog.getByRole("button", { name: "Publish to students" }).click();
      await faculty.waitForURL(new RegExp(`/faculty/cycles/${cycleId}$`));
      const saved = (await facultyApi.call("GET", `/course-cycles/${cycleId}`)).body;
      const expected = plannedDates({ teams: 7, ideas: 10, finalDays: 45 });
      assert(saved.status === "PUBLISHED", `status ${saved.status}`);
      assert(saved.ideaDeadline === expected.ideaDeadline, `ideas ${saved.ideaDeadline}, expected ${expected.ideaDeadline}`);
      assert(saved.teamFormationDeadline === expected.teamFormationDeadline, `teams ${saved.teamFormationDeadline}`);
    }, faculty);

    await run.check("A student of the batch sees the published cycle", async () => {
      const student = await devSignIn(await browser.newContext(), FRONTEND, STUDENT, "Ravi K");
      await student.locator(".cycle-card", { hasText: title }).waitFor();
    });

    await run.check("A new cycle starts from a previous one: its settings, with its phases moved to today", async () => {
      await faculty.goto(`${FRONTEND}/faculty/cycles`);
      await faculty.getByRole("button", { name: "+ New cycle" }).click();
      const template = await faculty.getByLabel("Start from").locator("option", { hasText: title }).getAttribute("value");
      await faculty.getByLabel("Start from").selectOption(template);
      assert((await faculty.getByLabel("Course name").inputValue()) === "Data Systems", "course name not copied");
      await faculty.getByLabel("Cycle title").fill(`${title} (repeat)`);
      await faculty.getByRole("button", { name: "Next: Teams" }).click();
      assert((await faculty.getByLabel("Minimum team size").inputValue()) === "2", "sizes not copied");
      await faculty.getByRole("button", { name: "Next: Timeline" }).click();
      assert((await faculty.getByLabel("Days for ideas").inputValue()) === "10", "phase lengths not copied");
      await faculty.getByRole("button", { name: "Next: Review" }).click();
      await faculty.getByRole("button", { name: "Save as draft" }).click();
      await faculty.waitForURL(/\/faculty\/cycles\/[0-9a-f-]{36}$/);
      copyId = faculty.url().split("/").pop();
      const saved = (await facultyApi.call("GET", `/course-cycles/${copyId}`)).body;
      const expected = plannedDates({ teams: 7, ideas: 10, finalDays: 45 });
      assert(copyId !== cycleId && saved.status === "DRAFT", "not a new draft");
      assert(saved.ideaDeadline === expected.ideaDeadline, `ideas ${saved.ideaDeadline}, expected ${expected.ideaDeadline}`);
      assert(saved.minTeamSize === 2 && saved.maxTeamSize === 4, `sizes ${saved.minTeamSize}-${saved.maxTeamSize}`);
    }, faculty);

    await run.check("The wizard works with the keyboard alone and at 375px wide", async () => {
      const phone = await devSignIn(
        await browser.newContext({ viewport: { width: 375, height: 812 } }),
        FRONTEND,
        FACULTY,
        "Kavita N",
      );
      await phone.goto(`${FRONTEND}/faculty/cycles/new`);
      await phone.getByLabel("Course name").focus();
      await phone.keyboard.type("Keyboard course");
      await phone.keyboard.press("Tab");
      await phone.keyboard.type("Keyboard cycle");
      await phone.keyboard.press("Enter");
      const focused = () => phone.evaluate(() => document.activeElement?.textContent ?? "");
      assert((await focused()).includes("How do students team up?"), `focus is on: ${await focused()}`);
      for (const next of ["Next: Timeline", "Next: Review"]) {
        const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert(overflow <= 0, `the page scrolls sideways by ${overflow}px`);
        await phone.getByRole("button", { name: next }).press("Enter");
      }
      assert((await focused()).includes("Check and save"), `focus is on: ${await focused()}`);
    });
    await run.check("The cycle page shows the phases with today, one primary action, and only the current section open", async () => {
      await faculty.goto(`${FRONTEND}/faculty/cycles/${cycleId}`);
      const phases = faculty.getByRole("list", { name: "Where the cycle is" });
      const current = phases.locator('[aria-current="step"]');
      await current.getByText("Teams").waitFor();
      await current.getByText("Now").waitFor();
      await current.getByText("Today").waitFor();
      await faculty.getByRole("button", { name: "See the teams" }).waitFor();
      assert(await faculty.getByRole("heading", { name: "Needs your attention" }).count() === 0, "attention card with nothing to do");
      const openSections = await faculty.locator("details.cycle-section[open] .cycle-section-title").allTextContents();
      assert(JSON.stringify(openSections) === '["Teams"]', `open sections ${JSON.stringify(openSections)}`);
      await faculty.locator(".cycle-section-summary", { hasText: "Ideas come once teams form" }).waitFor();
      await faculty.locator(".cycle-section-summary", { hasText: /in batch 2020/ }).waitFor();
    }, faculty);

    await run.check("'Needs your attention' lists a waiting idea, and its link opens the Ideas section", async () => {
      const partnerApi = await session(PARTNER, "Neha S");
      const partnerId = (await partnerApi.call("GET", "/auth/me")).body.id;
      const team = await studentApi.call("POST", `/course-cycles/${cycleId}/teams`, { name: "Indexers", memberIds: [partnerId] });
      assert(team.status === 201, `team: ${team.status}`);
      const idea = await studentApi.call("PUT", `/teams/${team.body.id}/idea`, {
        title: "Query planner visualiser",
        problem: "Query plans are hard to read",
        solution: "Draw them as trees",
      });
      assert(idea.status === 200, `idea: ${idea.status}`);
      await faculty.reload();
      const card = faculty.locator(".attention-card");
      await card.getByText("1 idea is waiting for your review").waitFor();
      await faculty.getByRole("button", { name: "Review 1 idea" }).waitFor();
      await card.getByRole("button", { name: "Review", exact: true }).click();
      await faculty.getByRole("button", { name: "Open the idea of Indexers" }).waitFor();
    }, faculty);

    await run.check("A draft's page publishes it through the same confirmation", async () => {
      await faculty.goto(`${FRONTEND}/faculty/cycles/${copyId}`);
      await faculty.getByText("Students can't see this cycle yet.").waitFor();
      await faculty.getByRole("button", { name: "Publish to students" }).click();
      const dialog = faculty.getByRole("dialog", { name: "Publish to students?" });
      await dialog.getByText(/the team sizes/).waitFor();
      await dialog.getByRole("button", { name: "Publish to students" }).click();
      await faculty.locator(".status", { hasText: "Open" }).waitFor();
      const saved = (await facultyApi.call("GET", `/course-cycles/${copyId}`)).body;
      assert(saved.status === "PUBLISHED", `status ${saved.status}`);
    }, faculty);

    await run.check("A closed cycle reads in the past tense, with nothing left to do", async () => {
      assert((await facultyApi.call("POST", `/course-cycles/${copyId}/close`)).status === 200, "close");
      await faculty.reload();
      const current = faculty.getByRole("list", { name: "Where the cycle is" }).locator('[aria-current="step"]');
      await current.getByText("Closed").waitFor();
      await faculty.locator(".cycle-section-summary", { hasText: "No teams were formed" }).waitFor();
      await faculty.locator(".cycle-section-summary", { hasText: "No work was submitted" }).waitFor();
      assert(await faculty.getByRole("button", { name: "Edit cycle" }).count() === 0, "Edit offered on a closed cycle");
      assert(await faculty.getByRole("heading", { name: "Needs your attention" }).count() === 0, "attention card on a closed cycle");
    }, faculty);
  } finally {
    await Promise.all(sessions.map((created) => created.dispose()));
    await browser.close();
  }
  process.exit(run.finish() ? 1 : 0);
})();
