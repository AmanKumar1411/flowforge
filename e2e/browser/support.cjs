// Shared helpers for the browser checks. See README.md.
const path = require("node:path");
const fs = require("node:fs");
const { request } = require("playwright-core");

const DOMAIN = "@nst.rishihood.edu.in";
const MINUTE_MS = 60 * 1000;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** Collects PASS/FAIL results, screenshots failures, and writes `<out>/<name>.json`. */
function createRun(outDir, name) {
  const results = [];
  return {
    async check(title, fn, page) {
      const started = Date.now();
      try {
        const detail = await fn();
        results.push({ name: title, ok: true, ms: Date.now() - started, detail: detail ?? "" });
        console.log(`PASS  ${title}`);
      } catch (error) {
        const message = String(error.message).split("\n")[0];
        results.push({ name: title, ok: false, ms: Date.now() - started, detail: message });
        console.log(`FAIL  ${title}\n      ${message}`);
        if (page) {
          await page.screenshot({ path: path.join(outDir, `${name}-fail-${results.length}.png`) }).catch(() => {});
        }
      }
    },
    finish() {
      fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(results, null, 2));
      const failed = results.filter((result) => !result.ok).length;
      console.log(`\n${results.length - failed}/${results.length} ${name} checks passed`);
      return failed;
    },
  };
}

async function devSignIn(context, frontend, email, name) {
  const page = await context.newPage();
  await page.goto(`${frontend}/login`);
  await page.getByLabel("University email").fill(email);
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Dev sign in" }).click();
  await page.waitForURL((url) => !["/login", "/auth/callback"].includes(url.pathname));
  return page;
}

/** A separate API session for setup, so each browser check exercises only the UI. */
async function apiSession(api, frontend, email, name) {
  const context = await request.newContext({ extraHTTPHeaders: { Origin: frontend } });
  const login = await context.post(`${api}/auth/dev-login`, { data: { email, name } });
  assert(login.status() === 204, `dev login for ${email}: ${login.status()}`);
  const { accessToken } = await (await context.post(`${api}/auth/refresh`)).json();
  const call = async (method, route, data) => {
    const response = await context.fetch(`${api}${route}`, {
      method,
      data,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const text = await response.text();
    return { status: response.status(), body: text ? JSON.parse(text) : null };
  };
  return { call, dispose: () => context.dispose() };
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

/** A local day `days` from today at a local time, as the wizard builds it (phases end at 11:59 PM). */
function localDayAt(days, hours, minutes) {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() + days, hours, minutes);
}

/** "YYYY-MM-DD" for a date input, `days` from today. */
function dayFromToday(days) {
  return localInput(localDayAt(days, 12, 0)).slice(0, 10);
}

/** The ISO dates the wizard stores for a plan starting today; the same rule as `buildSchedule`. */
function plannedDates({ teams, placing = 0, ideas, finalDays }) {
  const settled = teams + placing;
  return {
    teamFormationDeadline: localDayAt(teams, 23, 59).toISOString(),
    teamCompletionDeadline: localDayAt(settled, 23, 59).toISOString(),
    ideaDeadline: localDayAt(settled + ideas, 23, 59).toISOString(),
    submissionStartAt: localDayAt(settled + ideas + 1, 0, 0).toISOString(),
    submissionDeadline: localDayAt(finalDays, 23, 59).toISOString(),
  };
}

/**
 * Creates a cycle through the four-step wizard, starting from the faculty's
 * cycle list, and returns its id. `plan` sets the wizard's fields; anything
 * left out keeps the wizard's default. With `publish`, it publishes through
 * the confirmation dialog; otherwise it saves a draft.
 */
async function createCycleInWizard(page, plan) {
  await page.getByRole("button", { name: "+ New cycle" }).click();
  await page.getByRole("heading", { name: /What is this cycle\?/ }).waitFor();
  await page.getByLabel("Course name").fill(plan.courseName);
  await page.getByLabel("Cycle title").fill(plan.title);
  await page.getByLabel("Batch year").fill(String(plan.batchYear));
  if (plan.kind === "ELECTIVE") {
    await page.getByText("Advanced: course type").click();
    await page.getByRole("radio", { name: /^Elective/ }).check();
  }
  await page.getByRole("button", { name: "Next: Teams" }).click();
  if (plan.minTeamSize !== undefined) await page.getByLabel("Minimum team size").fill(String(plan.minTeamSize));
  if (plan.maxTeamSize !== undefined) await page.getByLabel("Maximum team size").fill(String(plan.maxTeamSize));
  if (plan.solo) await page.getByLabel("Allow solo projects").check();
  if (plan.placing) {
    await page.getByText("Advanced: extra time to place students").click();
    await page.getByLabel("Give me extra time to place students without a team").check();
    await page.getByLabel("Extra days for placing students").fill(String(plan.placing));
  }
  await page.getByRole("button", { name: "Next: Timeline" }).click();
  // The wizard starts a plan inside the batch's semester, which may still be ahead; these checks plan from today.
  await page.getByLabel("Start date").fill(dayFromToday(0));
  if (plan.teams !== undefined) await page.getByLabel("Days to form teams").fill(String(plan.teams));
  if (plan.ideas !== undefined) await page.getByLabel("Days for ideas").fill(String(plan.ideas));
  if (plan.finalDays !== undefined) await page.getByLabel("Final deadline").fill(dayFromToday(plan.finalDays));
  await page.getByRole("button", { name: "Next: Review" }).click();
  if (plan.publish) {
    await page.getByRole("button", { name: "Publish to students" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Publish to students" }).click();
  } else {
    await page.getByRole("button", { name: "Save as draft" }).click();
  }
  await page.waitForURL(/\/faculty\/cycles\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop();
}

/**
 * Opens a section of the faculty's cycle page ("Students", "Idea list", "Teams", "Ideas",
 * "Submissions") if it is closed. Only the current phase's section starts open.
 */
async function openSection(page, title) {
  const section = page.locator("details.cycle-section", {
    has: page.locator(".cycle-section-title", { hasText: new RegExp(`^${title}$`) }),
  });
  await section.waitFor();
  if (!(await section.evaluate((element) => element.open))) {
    await section.locator("summary").click();
  }
}

module.exports = {
  DOMAIN,
  MINUTE_MS,
  assert,
  createRun,
  devSignIn,
  apiSession,
  localInput,
  minuteFromNow,
  dayFromToday,
  plannedDates,
  createCycleInWizard,
  openSection,
};
