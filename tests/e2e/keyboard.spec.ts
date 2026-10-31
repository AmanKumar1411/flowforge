import { Page, expect, test } from "@playwright/test";
import { WEB, manifest, nameOf, sql } from "../support/api";
import { Watch, signIn } from "../support/browser";

// P2 keyboard-only: the student submit flow and the faculty grading flow with Tab, typing and Enter.
const m = manifest();
const { capstone, systems } = m.cycles;

/** Presses Tab until the focused element matches; returns how many presses it took. */
async function tabTo(page: Page, matches: (el: { tag: string; text: string; label: string }) => boolean, max = 1500): Promise<number> {
  for (let presses = 1; presses <= max; presses += 1) {
    await page.keyboard.press("Tab");
    const el = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      if (!active) return { tag: "", text: "", label: "" };
      const labelled = active.getAttribute("aria-label") ?? (active as HTMLInputElement).labels?.[0]?.textContent ?? "";
      return { tag: active.tagName, text: (active.textContent ?? "").trim(), label: labelled.trim() };
    });
    if (matches(el)) return presses;
  }
  throw new Error("focus never reached the control");
}

async function focusIsVisible(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const style = getComputedStyle(el);
    return (style.outlineStyle !== "none" && style.outlineWidth !== "0px") || style.boxShadow !== "none";
  });
}

test("KEY-1 a student submits milestone work with the keyboard only", async ({ browser }) => {
  const watch = new Watch();
  const team = capstone.teams[215];
  const page = await signIn(browser, watch, team.leader, nameOf(team.leader));
  await page.goto(`${WEB}/student/projects/${capstone.id}?tab=milestones`);
  await page.getByRole("heading", { name: /Working prototype/ }).waitFor();
  await page.locator("body").focus();
  const presses = await tabTo(page, (el) => el.tag === "BUTTON" && el.text === "Submit work");
  expect(await focusIsVisible(page), "focused button has a visible focus indicator").toBeTruthy();
  await page.keyboard.press("Enter");
  await tabTo(page, (el) => el.tag === "INPUT" && el.label.startsWith("GitHub repository"), 20);
  await page.keyboard.type("https://github.com/keyboard-only/prototype");
  await tabTo(page, (el) => el.tag === "BUTTON" && el.text === "Submit version 1", 20);
  await page.keyboard.press("Enter");
  await expect(page.locator(".milestone-card", { hasText: "Working prototype" }).getByRole("heading", { name: /Version 1 submitted/ })).toBeVisible();
  test.info().annotations.push({ type: "observation", description: `Tab presses to reach "Submit work": ${presses}` });
  watch.expectClean();
});

test("KEY-2 a faculty member grades a team with the keyboard only, within a press budget", async ({ browser }) => {
  test.setTimeout(180_000);
  const watch = new Watch();
  const page = await signIn(browser, watch, systems.owner, nameOf(systems.owner));
  await page.goto(`${WEB}/faculty/cycles/${systems.id}?tab=milestones`);
  const grading = page.getByRole("region", { name: "Grading of M1" });
  const firstRow = grading.locator(".grading-row").first();
  await firstRow.waitFor();
  const label = await firstRow.locator("textarea").first().getAttribute("aria-label");
  const teamName = label!.replace(/^Feedback for /, "");
  await page.locator("body").focus();
  // "Jump to grading of M1" (H16) takes the keyboard past the tabs and every team's submissions.
  const toJump = await tabTo(page, (el) => el.tag === "A" && el.text === "Jump to grading of M1", 60);
  await page.keyboard.press("Enter");
  const toField = await tabTo(page, (el) => el.tag === "TEXTAREA" && el.label === `Feedback for ${teamName}`, 20);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Graded with the keyboard only.");
  const toSave = await tabTo(page, (el) => el.tag === "BUTTON" && el.text === "Save", 5);
  expect(await focusIsVisible(page)).toBeTruthy();
  await page.keyboard.press("Enter");
  await expect(firstRow.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  const saved = await sql(`SELECT e.feedback FROM "Evaluation" e JOIN "Team" t ON t.id = e."teamId" WHERE t.name = $1 AND e."milestoneId" = $2`, [teamName, systems.milestones[0].id]);
  expect(saved[0].feedback).toBe("Graded with the keyboard only.");
  const presses = toJump + 1 + toField + toSave + 1;
  test.info().annotations.push({ type: "observation", description: `key presses from the top of the page to a saved evaluation: ${presses} (Tab to the jump link ${toJump}, Enter, Tab to the field ${toField}, Tab to Save ${toSave}, Enter); 513 Tab presses before H16` });
  expect(presses, "press budget").toBeLessThanOrEqual(40);
  watch.expectClean();
});
