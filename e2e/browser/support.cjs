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

module.exports = { DOMAIN, MINUTE_MS, assert, createRun, devSignIn, apiSession, localInput, minuteFromNow };
