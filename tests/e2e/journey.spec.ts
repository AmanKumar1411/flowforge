import { expect, test } from "@playwright/test";
import { WEB, login, manifest, nameOf, sql } from "../support/api";
import { Watch, expectNoSideScroll, openTab, signIn } from "../support/browser";

// E2E-S1 (seeded part) on every browser and on a 375px phone: a leader whose idea was rejected then
// approved, whose M1 feedback was released and then corrected, submits M2 through the UI. A member of
// the same team sees the team and the work but has no leader buttons.
const m = manifest();
const capstone = m.cycles.capstone;
// One team per browser project, each with a rejected-then-approved idea and an "Updated" M1 result.
const TEAM_BY_PROJECT: Record<string, number> = { "chrome-journey": 35, "mobile-chrome": 175, firefox: 105, webkit: 245 };

test("E2E-S1 leader and member journey on seeded data: dashboard, team, idea history, released feedback, M2 submission", async ({ browser }, info) => {
  test.setTimeout(240_000);
  const team = capstone.teams[TEAM_BY_PROJECT[info.project.name] ?? 5];
  const watch = new Watch();
  const viewport = info.project.use.viewport ?? { width: 1440, height: 900 };
  const leader = await signIn(browser, watch, team.leader, nameOf(team.leader), { viewport, isMobile: info.project.name === "mobile-chrome" ? true : undefined });
  const before = await sql(`SELECT count(*)::int AS n FROM "Submission" WHERE "teamId" = $1 AND "milestoneId" = $2`, [team.id, capstone.milestones[1].id]);

  await test.step("dashboard: projects, what is next, and the corrected-result update", async () => {
    await leader.goto(`${WEB}/student`);
    await expect(leader.getByRole("heading", { name: "Your projects" })).toBeVisible();
    await expect(leader.getByText("Capstone project").first()).toBeVisible();
    await expect(leader.getByRole("link", { name: /Your result for M1 · Proposal and design was updated/ })).toBeVisible();
    // The closed project of last term shows for its former members only (students 0-199 of 2023).
    const former = m.cycles.lastTerm.teams.some((t) => t.members.includes(team.leader));
    if (former) await expect(leader.getByText("Past projects (1)")).toBeVisible();
    else await expect(leader.getByText(/Past projects/)).toHaveCount(0);
    await expectNoSideScroll(leader);
  });

  await test.step("team tab: the team and its members; the deadline has passed so nothing can change", async () => {
    await leader.goto(`${WEB}/student/projects/${capstone.id}?tab=team`);
    await expect(leader.locator(".team-panel").getByRole("heading", { name: team.name })).toBeVisible();
    for (const email of team.members) await expect(leader.getByText(nameOf(email)).first()).toBeVisible();
    await expect(leader.getByRole("button", { name: "Edit team" })).toHaveCount(0);
    await expectNoSideScroll(leader);
  });

  await test.step("idea tab: approved, with the earlier rejection's feedback in the history", async () => {
    await openTab(leader, "Idea");
    await expect(leader.locator(".idea-status").first()).toContainText(/Approved/i);
    await expect(leader.getByText("Narrow the scope to one user group.")).toBeVisible();
    await expectNoSideScroll(leader);
  });

  await test.step("milestones tab: M1 feedback (no marks in this version), marked as updated after release", async () => {
    await openTab(leader, "Milestones");
    await expect(leader.getByText(/Updated after review\./)).toBeVisible();
    await expect(leader.getByText(/^Feedback released on /).first()).toBeVisible();
    await expect(leader.locator(".evaluation-marks")).toHaveCount(0);
    await expect(leader.getByText(/^Updated on /).first()).toBeVisible();
  });

  await test.step("M2: a Drive link in the GitHub field is refused with a clear message, then version 1 is submitted", async () => {
    const card = leader.locator(".milestone-card", { hasText: "Working prototype" });
    await card.getByRole("button", { name: "Submit work" }).click();
    await card.getByLabel("GitHub repository").fill("https://drive.google.com/file/d/abc");
    await card.getByRole("button", { name: "Submit version 1" }).click();
    await expect(card.getByText("Paste the repository's link: https://github.com/owner/repo")).toBeVisible();
    await card.getByLabel("GitHub repository").fill(`https://github.com/qa-${info.project.name}/prototype`);
    await card.getByRole("button", { name: "Submit version 1" }).click();
    await expect(card.getByRole("heading", { name: /Version 1 submitted/ })).toBeVisible();
    await expectNoSideScroll(leader);
    const after = await sql(`SELECT count(*)::int AS n FROM "Submission" WHERE "teamId" = $1 AND "milestoneId" = $2`, [team.id, capstone.milestones[1].id]);
    expect(after[0].n).toBe(before[0].n + 1);
  });

  await test.step("member: sees the team and the new version, has no leader buttons; the API refuses leader actions", async () => {
    const memberEmail = team.members[1];
    const member = await signIn(browser, watch, memberEmail, nameOf(memberEmail), { viewport });
    await member.goto(`${WEB}/student/projects/${capstone.id}?tab=team`);
    await expect(member.locator(".team-panel").getByRole("heading", { name: team.name })).toBeVisible();
    await expect(member.getByText(/leads this team\. Only the leader can change it\./)).toBeVisible();
    await expect(member.getByRole("button", { name: /Edit team|Disband/ })).toHaveCount(0);
    await openTab(member, "Idea");
    await expect(member.getByRole("button", { name: /Edit idea|Revise|Submit idea/ })).toHaveCount(0);
    await openTab(member, "Milestones");
    await expect(member.locator(".milestone-card", { hasText: "Working prototype" }).getByRole("heading", { name: /Version 1 submitted/ })).toBeVisible();
    await expectNoSideScroll(member);
    const api = await login(memberEmail);
    expect((await api.call("PATCH", `/teams/${team.id}`, { name: "Member rename" })).status).toBe(403);
    expect((await api.call("PUT", `/teams/${team.id}/idea`, { title: "x", problem: "x", solution: "x" })).status).toBeGreaterThanOrEqual(403);
  });

  watch.expectClean();
});

test("E2E-V1 visibility: another batch, a past project for former members only, a student with no team", async ({ browser }, info) => {
  test.skip(info.project.name !== "chrome-journey", "visibility is checked once, on desktop Chrome");
  const watch = new Watch();
  // A 2024 student does not see the 2023 capstone, even by URL.
  const other = await signIn(browser, watch, m.cycles.systems.teams[3].leader, nameOf(m.cycles.systems.teams[3].leader));
  await expect(other.getByText("Systems project").first()).toBeVisible();
  await expect(other.getByText("Capstone project")).toHaveCount(0);
  await other.goto(`${WEB}/student/projects/${capstone.id}`);
  await expect(other.getByText(/not available/i).first()).toBeVisible();
  // A former member reads last term's project, read-only, with its released feedback.
  const former = m.cycles.lastTerm.teams[2];
  const reader = await signIn(browser, watch, former.members[1], nameOf(former.members[1]));
  await reader.getByText("Past projects (1)").click();
  await expect(reader.locator(".past-projects").getByText("Last term project")).toBeVisible();
  await reader.goto(`${WEB}/student/projects/${m.cycles.lastTerm.id}?tab=milestones`);
  await expect(reader.getByText(/closed/i).first()).toBeVisible();
  await expect(reader.getByText(/^Feedback released on /).first()).toBeVisible();
  await expect(reader.locator(".evaluation-marks")).toHaveCount(0);
  await expect(reader.getByRole("button", { name: /Submit|Edit|Revise/ })).toHaveCount(0);
  // A 2023 student who had no team in it sees nothing of it.
  const outsider = await signIn(browser, watch, m.students["2023"][700], nameOf(m.students["2023"][700]));
  await expect(outsider.getByText("Capstone project").first()).toBeVisible();
  await expect(outsider.getByText(/Past projects/)).toHaveCount(0);
  await expect(outsider.getByText("Last term project")).toHaveCount(0);
  await outsider.goto(`${WEB}/student/projects/${m.cycles.lastTerm.id}`);
  await expect(outsider.getByText(/not available/i).first()).toBeVisible();
  watch.expectClean();
});

test("E2E-AUTH two tabs opened together keep the student signed in", async ({ browser }, info) => {
  test.skip(info.project.name !== "chrome-journey", "checked once, on desktop Chrome");
  const watch = new Watch();
  const email = capstone.teams[180].leader;
  const first = await signIn(browser, watch, email, nameOf(email));
  const context = first.context();
  // Session restore: two tabs load at the same moment and both refresh with the same cookie.
  const [tabA, tabB] = await Promise.all([context.newPage(), context.newPage()]);
  await Promise.all([tabA.goto(`${WEB}/student`), tabB.goto(`${WEB}/student`)]);
  await tabA.waitForLoadState("networkidle");
  await tabB.waitForLoadState("networkidle");
  const onLogin = [tabA, tabB].filter((tab) => new URL(tab.url()).pathname === "/login").length;
  // A third load shows whether the session survived at all.
  const tabC = await context.newPage();
  await tabC.goto(`${WEB}/student`);
  await tabC.waitForLoadState("networkidle");
  test.info().annotations.push({ type: "observation", description: `tabs on /login after a simultaneous load: ${onLogin} of 2; a later tab: ${new URL(tabC.url()).pathname}` });
  expect(onLogin).toBe(0);
  expect(new URL(tabC.url()).pathname).toBe("/student");
});
