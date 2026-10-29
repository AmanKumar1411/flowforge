// Browser end-to-end check of the Phase 4 team UI against the real API. See README.md.
// Usage: node teams-ui.e2e.cjs <chrome path> <frontend url> <api url> <out dir>
const path = require("node:path");
const fs = require("node:fs");
const { chromium, request } = require("playwright-core");
const { createCycleInWizard } = require("./support.cjs");
const [chromePath, FRONTEND, API, OUT] = process.argv.slice(2);

const DOMAIN = "@nst.rishihood.edu.in";
const MINUTE_MS = 60 * 1000;
const results = [];

async function check(name, fn, page) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Date.now() - started, detail: detail ?? "" });
    console.log(`PASS  ${name}`);
  } catch (error) {
    results.push({ name, ok: false, ms: Date.now() - started, detail: String(error.message).split("\n")[0] });
    console.log(`FAIL  ${name}\n      ${String(error.message).split("\n")[0]}`);
    if (page) await page.screenshot({ path: path.join(OUT, `teams-fail-${results.length}.png`) }).catch(() => {});
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function devSignIn(context, email, name) {
  const page = await context.newPage();
  await page.goto(`${FRONTEND}/login`);
  await page.getByLabel("University email").fill(email);
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Dev sign in" }).click();
  await page.waitForURL((url) => !["/login", "/auth/callback"].includes(url.pathname));
  return page;
}

/** A separate API session for setup, so each browser check exercises only the UI. */
async function apiSession(email, name) {
  const api = await request.newContext({ extraHTTPHeaders: { Origin: FRONTEND } });
  const login = await api.post(`${API}/auth/dev-login`, { data: { email, name } });
  assert(login.status() === 204, `dev login for ${email}: ${login.status()}`);
  const { accessToken } = await (await api.post(`${API}/auth/refresh`)).json();
  const call = async (method, route, data) => {
    const response = await api.fetch(`${API}${route}`, {
      method,
      data,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const text = await response.text();
    return { status: response.status(), body: text ? JSON.parse(text) : null };
  };
  return { call, dispose: () => api.dispose() };
}

// datetime-local inputs take local time without seconds.
function localInput(date) {
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const minuteFromNow = (minutes) => {
  const date = new Date(Date.now() + minutes * MINUTE_MS);
  date.setSeconds(0, 0);
  return date;
};

const teamPanel = (page) => page.locator(".team-panel");

(async () => {
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const fresh = () => browser.newContext();
  const sessions = [];
  try {
    // --- Setup through the API: a faculty member and four batch-2026 students who have signed in once ---
    const admin = await apiSession(`coordinator.x${DOMAIN}`, "Coordinator X");
    sessions.push(admin);
    const added = await admin.call("POST", "/admin/faculty-allowlist", { email: `meera.n${DOMAIN}` });
    assert([201, 409].includes(added.status), `allowlist: ${added.status}`);
    for (const [local, name] of [["isha.r26csai", "Isha"], ["kabir.m26csai", "Kabir"], ["tara.s26csai", "Tara"], ["zoya.k26csai", "Zoya"]]) {
      sessions.push(await apiSession(`${local}${DOMAIN}`, name));
    }

    const facultyContext = await fresh();
    const faculty = await devSignIn(facultyContext, `meera.n${DOMAIN}`, "Meera N");
    const cycleTitle = `Team formation ${Date.now()}`;
    let cycleId = "";

    await check("Faculty sets team rules in the cycle wizard and publishes the cycle", async () => {
      cycleId = await createCycleInWizard(faculty, {
        courseName: "Software Design",
        title: cycleTitle,
        batchYear: 2026,
        minTeamSize: 2,
        maxTeamSize: 3,
        teams: 1,
        ideas: 1,
      });
      await faculty.getByText(/· Teams of 2–3 ·/).waitFor();
      await faculty.getByRole("button", { name: "← Back to cycles" }).click();
      faculty.once("dialog", (dialog) => dialog.accept());
      const card = faculty.locator(".cycle-card", { hasText: cycleTitle });
      await card.getByRole("button", { name: "Publish" }).click();
      await card.locator(".status", { hasText: "Open" }).waitFor();
      return `cycle ${cycleId}`;
    }, faculty);

    await check("Faculty extends the formation deadline of the published cycle; team sizes are locked", async () => {
      const extended = minuteFromNow(180);
      await faculty.locator(".cycle-card", { hasText: cycleTitle }).getByRole("button", { name: "Edit" }).click();
      // The same wizard, with what publishing locked shown as locked.
      assert(await faculty.getByLabel("Course name").isDisabled(), "course name is editable after publish");
      await faculty.getByRole("button", { name: "Next: Teams" }).click();
      assert(await faculty.getByLabel("Minimum team size").isDisabled(), "minimum size is editable after publish");
      assert(await faculty.getByLabel("Maximum team size").isDisabled(), "maximum size is editable after publish");
      await faculty.getByRole("button", { name: "Next: Timeline" }).click();
      assert(await faculty.getByLabel("Submissions open").isDisabled(), "submissions open is editable after publish");
      await faculty.getByLabel("Students form teams until").fill(localInput(extended));
      await faculty.getByRole("button", { name: "Next: Review" }).click();
      await faculty.getByRole("button", { name: "Save changes" }).click();
      await faculty.waitForURL(new RegExp(`/faculty/cycles/${cycleId}$`));
      const cycle = await admin.call("GET", `/course-cycles/${cycleId}`);
      assert(cycle.body.teamFormationDeadline === extended.toISOString(),
        `deadline is ${cycle.body.teamFormationDeadline}, expected ${extended.toISOString()}`);
      return `teamFormationDeadline=${extended.toISOString()}`;
    }, faculty);

    const isha = await devSignIn(await fresh(), `isha.r26csai${DOMAIN}`, "Isha");
    const kabir = await devSignIn(await fresh(), `kabir.m26csai${DOMAIN}`, "Kabir");
    const tara = await devSignIn(await fresh(), `tara.s26csai${DOMAIN}`, "Tara");
    const zoya = await devSignIn(await fresh(), `zoya.k26csai${DOMAIN}`, "Zoya");
    const openCycle = async (page) => {
      await page.goto(`${FRONTEND}/student/cycles`);
      await page.getByRole("heading", { name: cycleTitle }).click();
      await page.waitForURL(new RegExp(`/student/cycles/${cycleId}$`));
    };

    await check("Student sees the team rules and an invitation to create a team", async () => {
      await isha.goto(`${FRONTEND}/student/cycles`);
      await isha.locator(".cycle-card", { hasText: cycleTitle }).locator(".card-tag", { hasText: "No team yet" }).waitFor();
      await openCycle(isha);
      await isha.getByText("2 to 3 members").first().waitFor();
      await teamPanel(isha).getByRole("heading", { name: "No team yet" }).waitFor();
      await teamPanel(isha).getByRole("button", { name: "Create a team" }).waitFor();
    }, isha);

    await check("'Create team' stays disabled while the team is below the minimum size", async () => {
      await teamPanel(isha).getByRole("button", { name: "Create a team" }).click();
      await isha.getByLabel("Team name").fill("Falcon");
      await isha.getByText("Members: 1 (allowed: 2 to 3)").waitFor();
      assert(await isha.getByRole("button", { name: "Create team" }).isDisabled(), "Create team is enabled with 1 member");
    }, isha);

    await check("Leader finds a batch-mate by name, adds them, and creates the team", async () => {
      await isha.getByLabel("Find batch-mates").fill("kab");
      const result = isha.getByRole("list", { name: "Search results" }).getByRole("listitem").filter({ hasText: "Kabir" });
      await result.getByRole("button", { name: "Add" }).click();
      await isha.getByText("Members: 2 (allowed: 2 to 3)").waitFor();
      await isha.getByRole("button", { name: "Create team" }).click();
      await teamPanel(isha).getByRole("heading", { name: "Falcon" }).waitFor();
      const leaderRow = teamPanel(isha).locator(".member-list li", { hasText: "Isha" });
      await leaderRow.locator(".leader-chip").waitFor();
      await teamPanel(isha).locator(".member-list li", { hasText: "Kabir" }).waitFor();
      await teamPanel(isha).getByRole("button", { name: "Edit team" }).waitFor();
    }, isha);

    await check("The added member sees the team at once, without accepting anything, and cannot edit it", async () => {
      await kabir.goto(`${FRONTEND}/student/cycles`);
      await kabir.locator(".cycle-card", { hasText: cycleTitle }).locator(".card-tag", { hasText: "Team Falcon" }).waitFor();
      await openCycle(kabir);
      await teamPanel(kabir).getByRole("heading", { name: "Falcon" }).waitFor();
      await kabir.getByText("Isha leads this team. Only the leader can change it.").waitFor();
      assert(await teamPanel(kabir).getByRole("button", { name: "Edit team" }).count() === 0, "member sees Edit team");
      assert(await teamPanel(kabir).getByRole("button", { name: "Disband" }).count() === 0, "member sees Disband");
    }, kabir);

    await check("Another leader's search shows that student as already in a team", async () => {
      await openCycle(tara);
      await teamPanel(tara).getByRole("button", { name: "Create a team" }).click();
      await tara.getByLabel("Find batch-mates").fill("kabir");
      const button = tara.getByRole("list", { name: "Search results" }).getByRole("button", { name: "Already in a team" });
      await button.waitFor();
      assert(await button.isDisabled(), "a student in another team can be added");
      await tara.getByRole("button", { name: "Cancel" }).click();
    }, tara);

    await check("Leader swaps a member before the deadline; the removed student loses the team", async () => {
      await teamPanel(isha).getByRole("button", { name: "Edit team" }).click();
      await isha.getByRole("button", { name: "Remove Kabir" }).click();
      await isha.getByLabel("Find batch-mates").fill("zoya");
      await isha.getByRole("list", { name: "Search results" }).getByRole("button", { name: "Add" }).click();
      await isha.getByRole("button", { name: "Save team" }).click();
      await teamPanel(isha).locator(".member-list li", { hasText: "Zoya" }).waitFor();
      assert(await teamPanel(isha).locator(".member-list li", { hasText: "Kabir" }).count() === 0, "Kabir is still listed");
      await kabir.reload();
      await teamPanel(kabir).getByRole("heading", { name: "No team yet" }).waitFor();
      await openCycle(zoya);
      await teamPanel(zoya).getByRole("heading", { name: "Falcon" }).waitFor();
    }, isha);

    await check("Faculty sees every team of the cycle with its leader and members", async () => {
      await faculty.reload();
      const row = faculty.locator(".team-row", { hasText: "Falcon" });
      await row.getByText("Led by Isha").waitFor();
      await row.getByText("2/3 members").waitFor();
      await row.getByRole("link", { name: "View details of Falcon" }).click();
      await faculty.getByRole("heading", { level: 1, name: "Falcon" }).waitFor();
      await faculty.getByText(/Formed by the students/).waitFor();
      const members = await faculty.locator(".member-list li").allInnerTexts();
      const flat = members.map((member) => member.replace(/\s+/g, " ").trim());
      assert(flat.length === 2 && /^Isha .*leader$/i.test(flat[0]) && flat[1].startsWith("Zoya"), `members ${JSON.stringify(flat)}`);
      return flat.join(" | ");
    }, faculty);

    await check("Leader disbands the team after confirming; every member is free again", async () => {
      isha.once("dialog", (dialog) => dialog.accept());
      await teamPanel(isha).getByRole("button", { name: "Disband" }).click();
      await teamPanel(isha).getByRole("heading", { name: "No team yet" }).waitFor();
      await zoya.reload();
      await teamPanel(zoya).getByRole("heading", { name: "No team yet" }).waitFor();
    }, isha);

    await check("After the formation deadline the team is shown as fixed, with no way to change it", async () => {
      // A second cycle whose formation closes a few seconds from now, with a team formed through the API.
      const facultyApi = await apiSession(`meera.n${DOMAIN}`, "Meera N");
      sessions.push(facultyApi);
      const deadline = new Date(Date.now() + 6000);
      const created = await facultyApi.call("POST", "/course-cycles", {
        courseName: "Software Design",
        title: `Fixed teams ${Date.now()}`,
        batchYear: 2026,
        semester: 7,
        academicYear: "2026-27",
        submissionStartAt: minuteFromNow(24 * 60).toISOString(),
        submissionDeadline: minuteFromNow(30 * 24 * 60).toISOString(),
        minTeamSize: 2,
        maxTeamSize: 2,
        teamFormationDeadline: deadline.toISOString(),
      });
      assert(created.status === 201, `cycle: ${created.status} ${JSON.stringify(created.body)}`);
      await facultyApi.call("POST", `/course-cycles/${created.body.id}/publish`);
      const taraApi = await apiSession(`tara.s26csai${DOMAIN}`, "Tara");
      sessions.push(taraApi);
      const kabirApi = await apiSession(`kabir.m26csai${DOMAIN}`, "Kabir");
      sessions.push(kabirApi);
      const kabirId = (await kabirApi.call("GET", "/auth/me")).body.id;
      const team = await taraApi.call("POST", `/course-cycles/${created.body.id}/teams`, { name: "Kestrel", memberIds: [kabirId] });
      assert(team.status === 201, `team: ${team.status} ${JSON.stringify(team.body)}`);
      await new Promise((resolve) => setTimeout(resolve, deadline.getTime() - Date.now() + 500));

      await tara.goto(`${FRONTEND}/student/cycles/${created.body.id}`);
      await teamPanel(tara).getByRole("heading", { name: "Kestrel" }).waitFor();
      await tara.getByText(/Students' own changes ended on/).waitFor();
      assert(await teamPanel(tara).getByRole("button", { name: "Edit team" }).count() === 0, "Edit team is offered after the deadline");
      const late = await taraApi.call("PATCH", `/teams/${team.body.id}`, { name: "Late rename" });
      assert(late.status === 409 && late.body.code === "TEAM_FORMATION_CLOSED", `API allowed a late change: ${late.status}`);
      return "UI read-only; PATCH → 409 TEAM_FORMATION_CLOSED";
    }, tara);
  } finally {
    await Promise.all(sessions.map((session) => session.dispose()));
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT, "teams-browser-e2e.json"), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} team browser checks passed`);
  process.exit(failed ? 1 : 0);
})();
