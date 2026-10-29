// Browser end-to-end check of the guided project wizard (Phase 8: milestones, publish checks) and the tabbed project page. See README.md.
// Usage: node cycles-ui.e2e.cjs <chrome path> <frontend url> <api url> <out dir>
const { chromium } = require("playwright-core");
const {
  DOMAIN,
  assert,
  createRun,
  devSignIn,
  apiSession,
  localInput,
  plannedDates,
  createCycleInWizard,
  openTab,
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
    let electiveId = "";
    let copyId = "";

    await run.check("A first-time faculty member sets up a project in one guided flow; the draft is saved from step 1 and students can't see it", async () => {
      cycleId = await createCycleInWizard(faculty, {
        courseName: "Data Systems",
        title,
        batchYear: 2020,
        minTeamSize: 2,
        maxTeamSize: 4,
      });
      const saved = (await facultyApi.call("GET", `/course-cycles/${cycleId}`)).body;
      const expected = plannedDates({});
      assert(saved.status === "DRAFT", `status ${saved.status}`);
      assert(saved.ideaDeadline === expected.ideaDeadline.toISOString(), `ideas ${saved.ideaDeadline}`);
      assert(saved.milestones.length === 1, `${saved.milestones.length} milestones`);
      assert(saved.milestones[0].submissionOpensAt === expected.opensAt.toISOString(), `opens ${saved.milestones[0].submissionOpensAt}`);
      assert(saved.milestones[0].linkRequirement.required.join() === "GITHUB", "GitHub not required by default");
      const visible = (await studentApi.call("GET", "/course-cycles")).body;
      assert(!visible.some((cycle) => cycle.id === cycleId), "a student sees a draft");
      return `draft ${cycleId}`;
    }, faculty);

    await run.check("The same wizard adds a Drive-only milestone, flags an overlap as it is typed, and publishes the core course", async () => {
      await faculty.goto(`${FRONTEND}/faculty/cycles/${cycleId}/edit?step=milestones`);
      await faculty.getByRole("button", { name: "+ Add milestone M2" }).click();
      const rows = faculty.locator(".milestone-row");
      await rows.nth(1).getByLabel("Name").fill("Final");
      const due = plannedDates({}).dueAt;
      await rows.nth(1).getByLabel("Submissions open").fill(localInput(new Date(due.getTime() - 24 * 3600 * 1000)));
      await faculty.getByText(/M2: Overlaps M1/).waitFor();
      await rows.nth(1).getByLabel("Submissions open").fill(localInput(new Date(due.getTime() + 60 * 1000)));
      await rows.nth(1).getByLabel("Due", { exact: true }).fill(localInput(new Date(due.getTime() + 10 * 24 * 3600 * 1000)));
      await rows.nth(1).getByLabel("Evaluation", { exact: true }).fill(localInput(new Date(due.getTime() + 11 * 24 * 3600 * 1000)));
      for (const [label, choice] of [["GitHub repository", "none"], ["Google Drive or Docs", "required"], ["Demo", "none"], ["Report", "none"]]) {
        await rows.nth(1).locator(".link-picker label", { hasText: label }).locator("select").selectOption(choice);
      }
      await faculty.getByText("The milestones follow each other without overlapping.").waitFor();
      await faculty.getByRole("button", { name: "Save and continue" }).click();
      await faculty.getByRole("heading", { name: /Which ideas do you offer\?/ }).waitFor();
      await faculty.goto(`${FRONTEND}/faculty/cycles/${cycleId}/edit?step=review`);
      await faculty.getByText("Everything students need is in place.").waitFor();
      await faculty.getByRole("button", { name: "Publish to students" }).click();
      const dialog = faculty.getByRole("dialog", { name: "Publish to students?" });
      await dialog.getByText("Students of batch 2020 will see this project").waitFor();
      await dialog.getByRole("button", { name: "Publish to students" }).click();
      await faculty.waitForURL(new RegExp(`/faculty/cycles/${cycleId}$`));
      const saved = (await facultyApi.call("GET", `/course-cycles/${cycleId}`)).body;
      assert(saved.status === "PUBLISHED", `status ${saved.status}`);
      assert(saved.milestones.map((m) => m.linkRequirement.required.join()).join("|") === "GITHUB|DRIVE", "link requirements");
    }, faculty);

    await run.check("An elective can't be published without students: the review says why and links to the step, then it publishes", async () => {
      await faculty.goto(`${FRONTEND}/faculty/cycles`);
      electiveId = await createCycleInWizard(faculty, {
        courseName: "Data Systems",
        title: `${title} elective`,
        batchYear: 2020,
        kind: "ELECTIVE",
      });
      await faculty.goto(`${FRONTEND}/faculty/cycles/${electiveId}/edit?step=review`);
      const blocked = faculty.locator(".check-list", { hasText: "Before you can publish" });
      await blocked.getByText(/Enroll the elective's students first/).waitFor();
      assert(await faculty.getByRole("button", { name: "Publish to students" }).isDisabled(), "publish offered while blocked");
      await blocked.getByRole("button", { name: "Go to Students" }).click();
      await faculty.getByRole("heading", { name: /Who takes part\?/ }).waitFor();
      await faculty.getByLabel("Student emails").fill(STUDENT);
      await faculty.getByRole("button", { name: /^Enroll/ }).click();
      await faculty.getByRole("status").filter({ hasText: /Added 1/ }).waitFor();
      await faculty.getByRole("button", { name: "Save and continue" }).click();
      await faculty.getByText("Everything students need is in place.").waitFor();
      await faculty.getByRole("button", { name: "Publish to students" }).click();
      await faculty.getByRole("dialog").getByRole("button", { name: "Publish to students" }).click();
      await faculty.waitForURL(new RegExp(`/faculty/cycles/${electiveId}$`));
      assert((await facultyApi.call("GET", `/course-cycles/${electiveId}`)).body.status === "PUBLISHED", "not published");
    }, faculty);

    await run.check("A student of the batch sees the published project with its stage and next event", async () => {
      const student = await devSignIn(await browser.newContext(), FRONTEND, STUDENT, "Ravi K");
      const card = student.locator(".cycle-card", { hasText: title }).first();
      await card.getByText("Teams forming").waitFor();
      await card.getByText(/Next: Team deadline/).waitFor();
    });

    await run.check("A new project starts from a previous one: its settings and milestones, with the dates moved to today", async () => {
      await faculty.goto(`${FRONTEND}/faculty/cycles`);
      await faculty.getByRole("button", { name: "+ New project" }).click();
      const template = await faculty.getByLabel("Start from").locator("option", { hasText: `${title} (batch` }).first().getAttribute("value");
      await faculty.getByLabel("Start from").selectOption(template);
      assert((await faculty.getByLabel("Course name").inputValue()) === "Data Systems", "course name not copied");
      assert((await faculty.getByLabel("Smallest team").inputValue()) === "2", "sizes not copied");
      await faculty.getByLabel("Project title").fill(`${title} (repeat)`);
      await faculty.getByRole("button", { name: "Save draft and continue" }).click();
      await faculty.getByRole("heading", { name: /When do teams and ideas settle\?/ }).waitFor();
      copyId = faculty.url().match(/cycles\/([0-9a-f-]{36})\/edit/)[1];
      const saved = (await facultyApi.call("GET", `/course-cycles/${copyId}`)).body;
      assert(copyId !== cycleId && saved.status === "DRAFT", "not a new draft");
      assert(saved.milestones.map((m) => m.name).join("|") === "Final submission|Final", "milestones not copied");
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
      await phone.keyboard.type("Keyboard project");
      await phone.keyboard.press("Enter");
      const focused = () => phone.evaluate(() => document.activeElement?.textContent ?? "");
      await phone.getByRole("heading", { name: /When do teams and ideas settle\?/ }).waitFor();
      assert((await focused()).includes("When do teams and ideas settle?"), `focus is on: ${await focused()}`);
      for (let step = 0; step < 4; step += 1) {
        const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert(overflow <= 0, `the page scrolls sideways by ${overflow}px`);
        await phone.getByRole("button", { name: "Save and continue" }).press("Enter");
        await phone.waitForTimeout(300);
      }
      assert((await focused()).includes("Check and publish"), `focus is on: ${await focused()}`);
    });

    await run.check("The project page opens on its overview: phases with today, one primary action, what comes next", async () => {
      await faculty.goto(`${FRONTEND}/faculty/cycles/${cycleId}`);
      const phases = faculty.getByRole("list", { name: "Where the project is" });
      const current = phases.locator('[aria-current="step"]');
      await current.getByText("Teams").waitFor();
      await current.getByText("Now").waitFor();
      await faculty.getByRole("heading", { name: "Coming up" }).waitFor();
      await faculty.locator(".event-list").getByText("Team deadline").waitFor();
      await faculty.getByRole("button", { name: "See the teams" }).waitFor();
      assert(await faculty.getByRole("heading", { name: "Needs your attention" }).count() === 0, "attention card with nothing to do");
      await faculty.locator(".glance", { hasText: /Batch 2020 students \(\d+\) · Manage/ }).waitFor();
      await openTab(faculty, "Teams");
      await faculty.getByRole("heading", { name: "Teams (0)" }).waitFor();
      await openTab(faculty, "Milestones");
      await faculty.getByRole("heading", { name: "Final", exact: true }).waitFor();
      await faculty.getByText("Links: Google Drive or Docs required").waitFor();
    }, faculty);

    await run.check("'Needs your attention' lists a waiting proposal, and its link opens that team's page to review it", async () => {
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
      await faculty.goto(`${FRONTEND}/faculty/cycles/${cycleId}`);
      const card = faculty.locator(".attention-card");
      await card.getByText("1 proposal is waiting for your review").waitFor();
      await faculty.getByRole("button", { name: "Review 1 proposal" }).waitFor();
      await card.getByRole("button", { name: "Review", exact: true }).click();
      await faculty.getByRole("heading", { level: 1, name: "Indexers" }).waitFor();
      await faculty.getByText("Draw them as trees").waitFor();
      await faculty.getByRole("button", { name: "Approve idea" }).waitFor();
    }, faculty);

    await run.check("A draft's page sends the faculty to the review step to publish", async () => {
      await faculty.goto(`${FRONTEND}/faculty/cycles/${copyId}`);
      await faculty.getByText("Students can't see this project yet.").waitFor();
      await faculty.getByRole("button", { name: "Review and publish" }).click();
      await faculty.getByRole("heading", { name: /Check and publish/ }).waitFor();
    }, faculty);

    await run.check("A closed project reads in the past tense, with nothing left to do", async () => {
      assert((await facultyApi.call("POST", `/course-cycles/${electiveId}/close`)).status === 200, "close");
      await faculty.goto(`${FRONTEND}/faculty/cycles/${electiveId}`);
      const current = faculty.getByRole("list", { name: "Where the project is" }).locator('[aria-current="step"]');
      await current.getByText("Closed").waitFor();
      await faculty.getByText("The project is closed.").waitFor();
      assert(await faculty.getByRole("button", { name: "Edit project" }).count() === 0, "Edit offered on a closed project");
      assert(await faculty.locator(".cycle-actions .primary-button").count() === 0, "a primary action on a closed project");
      assert(await faculty.getByRole("heading", { name: "Needs your attention" }).count() === 0, "attention card on a closed project");
    }, faculty);
  } finally {
    await Promise.all(sessions.map((created) => created.dispose()));
    await browser.close();
  }
  process.exit(run.finish() ? 1 : 0);
})();
