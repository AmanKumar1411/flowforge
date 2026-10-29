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

/**
 * A plan from today (Phase 8): teams for `teams` days, ideas for `ideas` more,
 * then one milestone open from the next midnight until day `finalDays`,
 * evaluated then. Deadlines fall at 11:59 PM, like the wizard's.
 */
function plannedDates({ teams = 7, ideas = 7, finalDays = 45 } = {}) {
  return {
    teamDeadline: localDayAt(teams, 23, 59),
    ideaDeadline: localDayAt(teams + ideas, 23, 59),
    opensAt: localDayAt(teams + ideas + 1, 0, 0),
    dueAt: localDayAt(finalDays, 23, 59),
    evaluationAt: localDayAt(finalDays, 23, 59),
  };
}

/** A cycle body for the API: the plan's dates and one milestone (GitHub required unless `linkRequirement` says otherwise). */
function cycleBody(fields, { teamDeadline, ideaDeadline, opensAt, dueAt, evaluationAt = dueAt }, linkRequirement) {
  return {
    semester: 7,
    academicYear: "2026-27",
    ...fields,
    teamDeadline: teamDeadline.toISOString(),
    ideaDeadline: ideaDeadline.toISOString(),
    milestones: [
      {
        name: "Final submission",
        submissionOpensAt: opensAt.toISOString(),
        submissionDueAt: dueAt.toISOString(),
        evaluationAt: evaluationAt.toISOString(),
        ...(linkRequirement ? { linkRequirement } : {}),
      },
    ],
  };
}

const IDEA_SOURCE_LABELS = {
  BOTH: /^Either/,
  STUDENT_PROPOSALS: /^Teams' own ideas/,
  FACULTY_LIST: /^Your list only/,
};

/**
 * Creates a cycle through the guided wizard (Phase 8), starting from the
 * faculty's cycle list, and returns its id. The draft is saved after the
 * first step. `plan` sets the fields; dates follow `plannedDates(plan)`, from
 * today. `enroll` adds an elective's students on the Students step. With
 * `publish`, it publishes through the review step's confirmation; otherwise
 * it leaves the draft.
 */
async function createCycleInWizard(page, plan) {
  await page.getByRole("button", { name: "+ New project" }).click();
  await page.getByRole("heading", { name: /What is this project\?/ }).waitFor();
  await page.getByLabel("Course name").fill(plan.courseName);
  await page.getByLabel("Project title").fill(plan.title);
  await page.getByLabel("Batch year").fill(String(plan.batchYear));
  if (plan.kind === "ELECTIVE") await page.getByRole("radio", { name: /^Elective/ }).check();
  if (plan.minTeamSize !== undefined) await page.getByLabel("Smallest team").fill(String(plan.minTeamSize));
  if (plan.maxTeamSize !== undefined) await page.getByLabel("Largest team").fill(String(plan.maxTeamSize));
  await page.getByRole("button", { name: "Save draft and continue" }).click();

  await page.getByRole("heading", { name: /When do teams and ideas settle\?/ }).waitFor();
  // The wizard may plan inside a semester that is still ahead; these checks plan from today.
  const dates = plannedDates(plan);
  await page.getByLabel("Team deadline").fill(localInput(dates.teamDeadline));
  await page.getByLabel("Idea deadline").fill(localInput(dates.ideaDeadline));
  if (plan.ideaSource) await page.getByRole("radio", { name: IDEA_SOURCE_LABELS[plan.ideaSource] }).check();
  await page.getByRole("button", { name: "Save and continue" }).click();

  await page.getByRole("heading", { name: /What do teams hand in, and when\?/ }).waitFor();
  await page.getByLabel("Submissions open").first().fill(localInput(dates.opensAt));
  await page.getByLabel("Due", { exact: true }).first().fill(localInput(dates.dueAt));
  await page.getByLabel("Evaluation", { exact: true }).first().fill(localInput(dates.evaluationAt));
  await page.getByRole("button", { name: "Save and continue" }).click();

  if (plan.ideaSource !== "STUDENT_PROPOSALS") {
    await page.getByRole("heading", { name: /Which ideas do you offer\?/ }).waitFor();
    await page.getByRole("button", { name: "Save and continue" }).click();
  }
  await page.getByRole("heading", { name: /Who takes part\?/ }).waitFor();
  if (plan.enroll?.length) {
    await page.getByLabel("Student emails").fill(plan.enroll.join("\n"));
    await page.getByRole("button", { name: /^Enroll/ }).click();
    await page.getByRole("status").filter({ hasText: /Enrolled|added/i }).first().waitFor();
  }
  await page.getByRole("button", { name: "Save and continue" }).click();
  await page.getByRole("heading", { name: /Check and publish/ }).waitFor();
  const id = page.url().match(/cycles\/([0-9a-f-]{36})\/edit/)[1];
  if (plan.publish) {
    await page.getByRole("button", { name: "Publish to students" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Publish to students" }).click();
    await page.waitForURL(new RegExp(`/faculty/cycles/${id}$`));
  } else {
    await page.getByRole("button", { name: "← Back to the project" }).click();
    await page.waitForURL(new RegExp(`/faculty/cycles/${id}$`));
  }
  return id;
}

/** Opens a tab of the faculty's cycle page (Phase 8: Overview, Students, Teams, Ideas, Milestones). */
async function openTab(page, name) {
  await page.getByRole("navigation", { name: "Project sections" }).getByRole("button", { name, exact: true }).click();
}

/** Opens a team's page from the teams list on the faculty's cycle page. */
async function openTeamPage(page, teamName) {
  await page.getByRole("link", { name: `View details of ${teamName}` }).click();
  await page.getByRole("heading", { level: 1, name: teamName }).waitFor();
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
  cycleBody,
  createCycleInWizard,
  openTab,
  openTeamPage,
};
