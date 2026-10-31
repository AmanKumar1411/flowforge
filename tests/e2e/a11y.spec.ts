import AxeBuilder from "@axe-core/playwright";
import { Page, expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { WEB, manifest, nameOf } from "../support/api";
import { Watch, signIn } from "../support/browser";

// P2 accessibility: axe (WCAG 2.1 A/AA rules) on every main page, for each role.
const m = manifest();
const { capstone, systems, web } = m.cycles;
const results: { page: string; violations: { id: string; impact: string | null; nodes: number; help: string; sample: string }[] }[] = [];

async function audit(page: Page, label: string) {
  await page.waitForLoadState("networkidle");
  const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  results.push({ page: label, violations: scan.violations.map((v) => ({ id: v.id, impact: v.impact ?? null, nodes: v.nodes.length, help: v.help, sample: v.nodes.slice(0, 3).map((n) => `${n.target.join(" ")} :: ${(n.failureSummary ?? "").split("\n").slice(1, 2).join("").trim()}`).join(" || ") })) });
}

test.afterAll(() => {
  const out = path.join(__dirname, "..", "results", "a11y.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(results, null, 1));
});

test("A11Y-1 axe on the student, faculty and admin pages", async ({ browser }) => {
  test.setTimeout(480_000);
  const watch = new Watch();
  const anonymous = watch.attach(await (await browser.newContext()).newPage(), "anonymous");
  await anonymous.goto(`${WEB}/login`);
  await audit(anonymous, "login");

  const team = capstone.teams[60];
  const student = await signIn(browser, watch, team.leader, nameOf(team.leader));
  await audit(student, "student dashboard");
  for (const tab of ["overview", "team", "idea", "milestones"]) {
    await student.goto(`${WEB}/student/projects/${capstone.id}${tab === "overview" ? "" : `?tab=${tab}`}`);
    await audit(student, `student project: ${tab}`);
  }
  const forming = await signIn(browser, watch, m.students["2025"][835], nameOf(m.students["2025"][835]));
  await forming.goto(`${WEB}/student/projects/${m.cycles.design.id}?tab=team`);
  await forming.getByRole("button", { name: "Create a team" }).click();
  await audit(forming, "student: create a team form");

  const faculty = await signIn(browser, watch, capstone.owner, nameOf(capstone.owner));
  await audit(faculty, "faculty projects");
  for (const tab of ["overview", "students", "teams", "ideas", "milestones"]) {
    await faculty.goto(`${WEB}/faculty/cycles/${capstone.id}${tab === "overview" ? "" : `?tab=${tab}`}`);
    await audit(faculty, `faculty project: ${tab}`);
  }
  const charlie = await signIn(browser, watch, web.owner, nameOf(web.owner));
  await charlie.goto(`${WEB}/faculty/cycles/${web.id}?tab=teams`);
  await audit(charlie, "faculty: place students (idea stage)");
  await faculty.goto(`${WEB}/faculty/cycles/${m.cycles.draftElective.id}/edit`);
  for (const step of ["details", "teams", "milestones", "ideas", "students", "review"]) {
    await faculty.goto(`${WEB}/faculty/cycles/${m.cycles.draftElective.id}/edit?step=${step}`);
    await audit(faculty, `wizard: ${step}`);
  }
  const bravo = await signIn(browser, watch, systems.owner, nameOf(systems.owner));
  await bravo.goto(`${WEB}/faculty/cycles/${systems.id}?tab=milestones`);
  await audit(bravo, "faculty: grading (unreleased)");

  const admin = await signIn(browser, watch, m.admin, "QA Admin");
  await audit(admin, "admin home");

  const serious = results.flatMap((r) => r.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => `${r.page}: ${v.id} (${v.impact}, ${v.nodes} nodes) ${v.help}`));
  test.info().annotations.push({ type: "observation", description: `${results.length} pages scanned; ${results.reduce((n, r) => n + r.violations.length, 0)} violation types in total; serious/critical: ${serious.length}` });
  for (const line of serious) test.info().annotations.push({ type: "observation", description: line });
  watch.expectClean();
  expect(serious).toEqual([]);
});
