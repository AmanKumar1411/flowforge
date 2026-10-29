// Browser end-to-end check of the cycle wizard (create, draft, edit, publish, start from a previous cycle). See README.md.
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
      const copyId = faculty.url().split("/").pop();
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
  } finally {
    await Promise.all(sessions.map((created) => created.dispose()));
    await browser.close();
  }
  process.exit(run.finish() ? 1 : 0);
})();
