// Browser end-to-end check of the Phase 5 UI (electives, looking for a team, faculty team completion). See README.md.
// Usage: node completion-ui.e2e.cjs <chrome path> <frontend url> <api url> <out dir>
const { chromium } = require("playwright-core");
const {
  DOMAIN,
  assert,
  createRun,
  devSignIn,
  apiSession,
  createCycleInWizard,
  plannedDates,
} = require("./support.cjs");
const [chromePath, FRONTEND, API, OUT] = process.argv.slice(2);

// Batch 2024 belongs to this script alone, so "students without a team" counts stay predictable.
const STUDENTS = {
  anya: "anya.r24csai",
  bilal: "bilal.k24csai",
  chen: "chen.l24csai",
  dia: "dia.m24csai",
  eshan: "eshan.p24csai",
  farah: "farah.s24csai",
  gopal: "gopal.t24csai",
};
const name = (key) => key[0].toUpperCase() + key.slice(1);
const email = (key) => `${STUDENTS[key]}${DOMAIN}`;
const FORMATION_SECONDS = 45;
// A team's row in the faculty's teams list.
const teamRow = (page, name) => page.locator(".team-row", { hasText: name });

(async () => {
  const run = createRun(OUT, "completion-browser-e2e");
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const fresh = () => browser.newContext();
  const sessions = [];
  const session = async (address, displayName) => {
    const created = await apiSession(API, FRONTEND, address, displayName);
    sessions.push(created);
    return created;
  };
  try {
    // --- Setup through the API: a faculty member and seven batch-2024 students who have signed in once ---
    const admin = await session(`coordinator.x${DOMAIN}`, "Coordinator X");
    const allowlisted = await admin.call("POST", "/admin/faculty-allowlist", { email: `meera.n${DOMAIN}` });
    assert([201, 409].includes(allowlisted.status), `allowlist: ${allowlisted.status}`);
    const api = {};
    const ids = {};
    for (const key of Object.keys(STUDENTS)) {
      api[key] = await session(email(key), name(key));
      ids[key] = (await api[key].call("GET", "/auth/me")).body.id;
    }
    const facultyApi = await session(`meera.n${DOMAIN}`, "Meera N");
    const faculty = await devSignIn(await fresh(), FRONTEND, `meera.n${DOMAIN}`, "Meera N");
    const electiveTitle = `Elective ${Date.now()}`;
    let electiveId = "";

    // --- Electives ---
    await run.check("Faculty creates an elective with extra time to place students in the wizard", async () => {
      // The faculty's own window appears only when they ask for it, under "Advanced".
      const plan = { teams: 1, placing: 1, ideas: 1, finalDays: 30 };
      electiveId = await createCycleInWizard(faculty, {
        courseName: "Machine Learning",
        title: electiveTitle,
        kind: "ELECTIVE",
        batchYear: 2024,
        minTeamSize: 2,
        maxTeamSize: 3,
        ...plan,
      });
      const completion = plannedDates(plan).teamCompletionDeadline;
      await faculty.getByText(/^Elective · open to enrolled students · Teams of 2–3 · Semester /).waitFor();
      // An elective's page links to its students; enrolling happens there.
      await faculty.getByRole("link", { name: "Manage" }).click();
      await faculty.getByRole("heading", { name: /Enrolled students/ }).waitFor();
      const saved = (await facultyApi.call("GET", `/course-cycles/${electiveId}`)).body;
      assert(saved.kind === "ELECTIVE", `kind ${saved.kind}`);
      assert(saved.teamCompletionDeadline === completion, `completion ${saved.teamCompletionDeadline}, expected ${completion}`);
      return `elective ${electiveId}`;
    }, faculty);

    await run.check("Faculty enrolls students by pasting emails; rows that are not student emails are reported", async () => {
      await faculty.getByLabel("Student emails").fill(
        // Enrolling registers the newcomer; batch 2022 keeps them out of this script's batch-2024 counts.
        [email("anya"), `newcomer.y22csai${DOMAIN}`, `prakriti.p${DOMAIN}`, "someone@gmail.com"].join("\n"),
      );
      await faculty.getByRole("button", { name: "Enroll 4" }).click();
      await faculty.getByText("Added 2 · already enrolled 0 · not added 2").waitFor();
      await faculty.getByText(`prakriti.p${DOMAIN}: A staff email, not a student`).waitFor();
      const rows = faculty.locator(".team-panel", { has: faculty.getByRole("heading", { name: /Enrolled students/ }) }).locator("tbody tr");
      await rows.filter({ hasText: "Anya" }).waitFor();
      await rows.filter({ hasText: "Not signed in yet" }).waitFor();
    }, faculty);

    await run.check("Faculty enrolls more students from a CSV file", async () => {
      await faculty.getByLabel("Upload CSV").setInputFiles({
        name: "roster.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(`name,email\nChen,${email("chen")}\nAnya,${email("anya")}\n`),
      });
      await faculty.getByText("Added 1 · already enrolled 1 · not added 0").waitFor();
      await faculty.getByRole("heading", { name: "Enrolled students (3)" }).waitFor();
    }, faculty);

    await run.check("Only enrolled students see the published elective", async () => {
      const published = await facultyApi.call("POST", `/course-cycles/${electiveId}/publish`);
      assert(published.status === 200, `publish ${published.status}`);
      const anya = await devSignIn(await fresh(), FRONTEND, email("anya"), "Anya");
      await anya.locator(".cycle-card", { hasText: electiveTitle }).getByText("Elective · Batch 2024").waitFor();
      const bilal = await devSignIn(await fresh(), FRONTEND, email("bilal"), "Bilal");
      await bilal.locator(".cycle-grid, .empty-state").first().waitFor();
      assert(await bilal.locator(".cycle-card", { hasText: electiveTitle }).count() === 0, "Bilal sees the elective");
    }, faculty);

    // --- A core cycle: students form teams for 45 seconds, then the faculty complete them ---
    const now = Date.now();
    const formationDeadline = new Date(now + FORMATION_SECONDS * 1000);
    const created = await facultyApi.call("POST", "/course-cycles", {
      courseName: "Software Design",
      title: `Completion ${now}`,
      batchYear: 2024,
      semester: 7,
      academicYear: "2026-27",
      submissionStartAt: new Date(now + 3 * 24 * 3600 * 1000).toISOString(),
      submissionDeadline: new Date(now + 30 * 24 * 3600 * 1000).toISOString(),
      minTeamSize: 2,
      maxTeamSize: 3,
      teamFormationDeadline: formationDeadline.toISOString(),
      teamCompletionDeadline: new Date(now + 3600 * 1000).toISOString(),
    });
    assert(created.status === 201, `cycle: ${created.status} ${JSON.stringify(created.body)}`);
    const cycleId = created.body.id;
    await facultyApi.call("POST", `/course-cycles/${cycleId}/publish`);
    const studentPage = async (key) => {
      const page = await devSignIn(await fresh(), FRONTEND, email(key), name(key));
      await page.goto(`${FRONTEND}/student/cycles/${cycleId}`);
      await page.locator(".team-panel").waitFor();
      return page;
    };
    const farah = await studentPage("farah");
    const anya = await studentPage("anya");

    await run.check("A student switches on 'Looking for a team' with a note, and a leader sees it", async () => {
      await farah.getByLabel("Note for leaders (optional)").fill("Design and slides");
      await farah.getByRole("button", { name: "I'm looking for a team" }).click();
      await farah.getByText("You are listed as looking for a team.").waitFor();
      await anya.getByRole("button", { name: "Create a team" }).click();
      const looking = anya.getByRole("list", { name: "Looking for a team" });
      await looking.getByText("Design and slides").waitFor();
      await looking.locator(".looking-tag").first().waitFor();
      await anya.getByRole("button", { name: "Cancel" }).click();
    }, anya);

    // Anya forms a team with Bilal through the API (the UI flow is covered by teams-ui).
    const falcon = await api.anya.call("POST", `/course-cycles/${cycleId}/teams`, { name: "Falcon", memberIds: [ids.bilal] });
    assert(falcon.status === 201, `team: ${falcon.status}`);
    await new Promise((resolve) => setTimeout(resolve, formationDeadline.getTime() - Date.now() + 1000));

    await run.check("After the students' deadline, a student without a team is told the faculty will place them", async () => {
      await farah.reload();
      await farah.getByText(/Your faculty will place you in one by/).waitFor();
      assert(await farah.getByRole("button", { name: "Create a team" }).count() === 0, "Create a team is still offered");
    }, farah);

    await faculty.goto(`${FRONTEND}/faculty/cycles/${cycleId}`);
    const completion = faculty.locator(".team-panel", { has: faculty.getByRole("heading", { name: /Students without a team/ }) });

    await run.check("Faculty sees the students without a team, with the 'Looking' tag", async () => {
      await faculty.getByRole("heading", { name: "Students without a team (5)" }).waitFor();
      const farahRow = completion.locator("li", { hasText: "Farah" });
      await farahRow.locator(".looking-tag").waitFor();
      await farahRow.getByText("Design and slides").waitFor();
    }, faculty);

    await run.check("Faculty builds a team from selected students and picks its leader", async () => {
      await completion.locator("li", { hasText: "Chen" }).getByRole("checkbox").check();
      await completion.locator("li", { hasText: "Dia" }).getByRole("checkbox").check();
      await faculty.getByLabel("Team name").fill("Kestrel");
      await faculty.getByLabel("Leader").selectOption({ label: "Dia" });
      await faculty.getByRole("button", { name: "Create team" }).click();
      await faculty.getByText("Created Kestrel.").waitFor();
      const row = teamRow(faculty, "Kestrel");
      await row.getByText("Led by Dia").waitFor();
      await row.getByText("2/3 members").waitFor();
      const kestrel = (await facultyApi.call("GET", `/course-cycles/${cycleId}/teams`)).body.find((team) => team.name === "Kestrel");
      const members = kestrel.members.map((member) => `${member.name}${member.isLeader ? " (leader)" : ""}`);
      assert(kestrel.origin === "FACULTY" && JSON.stringify(members) === '["Dia (leader)","Chen"]', `Kestrel ${kestrel.origin} ${members}`);
      await faculty.getByRole("heading", { name: "Students without a team (3)" }).waitFor();
    }, faculty);

    await run.check("Faculty adds a student to a team that has room", async () => {
      const row = completion.locator("li", { hasText: "Eshan" });
      await row.getByLabel("Team for Eshan").selectOption({ label: "Falcon (2/3)" });
      await row.getByRole("button", { name: "Add" }).click();
      await faculty.getByText("Added Eshan to Falcon.").waitFor();
      await faculty.getByRole("heading", { name: "Students without a team (2)" }).waitFor();
    }, faculty);

    await run.check("Auto-group previews random teams, re-rolls, and creates them on confirmation", async () => {
      await faculty.getByRole("button", { name: "Auto-group the rest" }).click();
      const proposal = faculty.getByLabel("Auto-group proposal");
      await proposal.locator(".proposal-card").first().waitFor();
      await proposal.getByRole("button", { name: "Re-roll" }).click();
      await proposal.locator(".proposal-card").first().waitFor();
      const cards = await proposal.locator(".proposal-card").count();
      assert(cards === 1, `${cards} proposed teams for 2 students`);
      await proposal.getByRole("button", { name: "Create these teams" }).click();
      await faculty.getByText("Created 1 team.").waitFor();
      await faculty.getByText("Every student is in a team.").waitFor();
      await teamRow(faculty, /Auto team \d+/).waitFor();
    }, faculty);

    await run.check("An auto-grouped student sees their new team without doing anything", async () => {
      await farah.reload();
      await farah.locator(".team-panel").getByRole("heading", { name: /^Auto team \d+$/ }).waitFor();
      await farah.locator(".member-list li", { hasText: "Gopal" }).waitFor();
      await farah.locator(".leader-chip").waitFor();
    }, farah);
  } finally {
    await Promise.all(sessions.map((created) => created.dispose()));
    await browser.close();
  }
  process.exit(run.finish() ? 1 : 0);
})();
