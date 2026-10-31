import { expect, test } from "@playwright/test";
import { WEB, manifest, nameOf, sql } from "../support/api";
import { Watch, openTab, signIn } from "../support/browser";

// E2E-F2: an elective's faculty enrolls students by paste and by CSV, publishes, and follows the
// teams and the submission counts of a running elective (the seeded "ML elective").
const m = manifest();
const DELTA = m.faculty[3];

test("E2E-F2 elective faculty: enroll by paste and CSV, publish, then see teams and submission counts", async ({ browser }) => {
  test.setTimeout(180_000);
  const watch = new Watch();
  const faculty = await signIn(browser, watch, DELTA, nameOf(DELTA));
  const title = `Elective ${Date.now()}`;
  const [first, second, third] = [m.students["2024"][500], m.students["2024"][501], m.students["2024"][502]];

  await test.step("wizard: an elective for batch 2024 with the default plan", async () => {
    await faculty.getByRole("button", { name: "+ New project" }).click();
    await faculty.getByLabel("Course name").fill("QA Electives");
    await faculty.getByLabel("Project title").fill(title);
    await faculty.getByLabel("Batch year").fill("2024");
    await faculty.getByRole("radio", { name: /^Elective/ }).check();
    await faculty.getByRole("button", { name: "Save draft and continue" }).click();
    for (const heading of [/When do teams and ideas settle\?/, /What do teams hand in, and when\?/, /Which ideas do you offer\?/, /Who takes part\?/]) {
      await expect(faculty.getByRole("heading", { name: heading })).toBeVisible();
      if (!/Who takes part/.test(String(heading))) await faculty.getByRole("button", { name: "Save and continue" }).click();
    }
  });

  await test.step("enroll by paste: rows that are not student emails are reported (electives take any batch)", async () => {
    await faculty.getByLabel("Student emails").fill([first, second, m.faculty[0], m.students["2025"][400]].join("\n"));
    await faculty.getByRole("button", { name: "Enroll 4" }).click();
    await expect(faculty.getByText("Added 3 · already enrolled 0 · not added 1")).toBeVisible();
    await expect(faculty.getByText(`${m.faculty[0]}: A staff email, not a student`)).toBeVisible();
  });

  await test.step("enroll by CSV: new and already-enrolled rows are counted", async () => {
    await faculty.getByLabel("Upload CSV").setInputFiles({ name: "students.csv", mimeType: "text/csv", buffer: Buffer.from(`email\n${third}\n${first}\n`) });
    await expect(faculty.getByText("Added 1 · already enrolled 1 · not added 0")).toBeVisible();
    await expect(faculty.getByRole("heading", { name: "Enrolled students (4)" })).toBeVisible();
  });

  await test.step("publish; enrolled students see it, the rest of the batch does not", async () => {
    await faculty.getByRole("button", { name: "Save and continue" }).click();
    await expect(faculty.getByText("Everything students need is in place.")).toBeVisible();
    await faculty.getByRole("button", { name: "Publish to students" }).click();
    await faculty.getByRole("dialog", { name: "Publish to students?" }).getByRole("button", { name: "Publish to students" }).click();
    await faculty.waitForURL(/\/faculty\/cycles\/[0-9a-f-]+$/);
    const enrolled = await signIn(browser, watch, third, nameOf(third));
    await expect(enrolled.getByText(title).first()).toBeVisible();
    const notEnrolled = await signIn(browser, watch, m.students["2024"][503], nameOf(m.students["2024"][503]));
    await expect(notEnrolled.getByRole("heading", { name: "Your projects" })).toBeVisible();
    await expect(notEnrolled.getByText(title)).toHaveCount(0);
  });

  await test.step("the running elective: 20 teams, and M1 submitted by 10 of them", async () => {
    await faculty.goto(`${WEB}/faculty/cycles/${m.cycles.ml.id}`);
    await expect(faculty.getByText("10 teams have not submitted M1 · Proposal and design yet")).toBeVisible();
    await expect(faculty.getByText("20 teams", { exact: true })).toBeVisible();
    await expect(faculty.getByText(/M1 · Proposal and design: 10 of 20 teams submitted/)).toBeVisible();
    await openTab(faculty, "Teams");
    await expect(faculty.locator(".team-row")).toHaveCount(20);
    await openTab(faculty, "Milestones");
    await expect(faculty.getByText("10 of 20 teams submitted").first()).toBeVisible();
    const db = await sql(`SELECT count(DISTINCT "teamId")::int AS n FROM "Submission" WHERE "cycleId" = $1`, [m.cycles.ml.id]);
    expect(db[0].n).toBe(10);
  });

  watch.expectClean();
});
