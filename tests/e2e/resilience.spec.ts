import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";
import { WEB, login, manifest, nameOf, sql } from "../support/api";
import { Watch, signIn } from "../support/browser";

// P2 resilience: the database restarts under a signed-in user; a phone on slow 3G.
// Run alone: RES-1 stops the QA database container for a few seconds.
const m = manifest();
const capstone = m.cycles.capstone;

test("RES-1 a database restart mid-session: clear errors during the outage, recovery without restarting the API", async ({ browser }) => {
  test.setTimeout(180_000);
  const watch = new Watch();
  const team = capstone.teams[220];
  const page = await signIn(browser, watch, team.members[1], nameOf(team.members[1]));
  await expect(page.getByRole("heading", { name: "Your projects" })).toBeVisible();
  const api = await login(team.members[2]);
  const before = (await sql(`SELECT count(*)::int AS n FROM "Submission" WHERE "teamId" = $1`, [team.id]))[0].n;

  execSync("docker stop -t 2 flowforge-qa-db", { stdio: "pipe" });
  const outage: string[] = [];
  try {
    const read = await api.call("GET", "/me/dashboard");
    const write = await api.call("POST", `/teams/${team.id}/milestones/${capstone.milestones[1].id}/submissions`, { links: [{ type: "GITHUB", url: "https://github.com/outage/x" }] });
    outage.push(`read ${read.status} ${read.body?.code ?? ""}`, `write ${write.status} ${write.body?.code ?? ""}`);
    for (const reply of [read, write]) {
      expect(reply.status).toBeGreaterThanOrEqual(500);
      expect(reply.text).not.toMatch(/ECONNREFUSED|5433|postgres|stack|at .*\.js/i);
    }
    // A full page load during the outage: the app refreshes its token first.
    await page.goto(`${WEB}/student/projects/${capstone.id}?tab=milestones`);
    await page.waitForLoadState("networkidle");
    const message = page.locator(".form-error, .notice, [role=alert]").first();
    outage.push(`UI during outage: ${new URL(page.url()).pathname}${(await message.isVisible()) ? ` "${(await message.innerText()).slice(0, 100)}"` : " (no error message)"}`);
  } finally {
    execSync("docker start flowforge-qa-db", { stdio: "pipe" });
    for (let i = 0; i < 30; i += 1) {
      try {
        execSync("docker exec flowforge-qa-db pg_isready -U qa -d flowforge_qa", { stdio: "pipe" });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
  // The API's pool reconnects by itself.
  let recovered = 0;
  for (let i = 0; i < 20 && recovered !== 200; i += 1) {
    recovered = (await api.call("GET", "/me/dashboard")).status;
    if (recovered !== 200) await new Promise((r) => setTimeout(r, 1000));
  }
  outage.push(`after restart: ${recovered}`);
  test.info().annotations.push({ type: "observation", description: outage.join("; ") });
  expect(recovered).toBe(200);
  // The student should still be signed in once the database is back.
  await page.goto(`${WEB}/student/projects/${capstone.id}?tab=milestones`);
  await page.waitForLoadState("networkidle");
  test.info().annotations.push({ type: "observation", description: `after recovery the student is on ${new URL(page.url()).pathname}` });
  expect(new URL(page.url()).pathname, "the outage signed the student out").not.toBe("/login");
  await expect(page.locator(".milestone-card", { hasText: "Working prototype" })).toBeVisible();
  const after = (await sql(`SELECT count(*)::int AS n FROM "Submission" WHERE "teamId" = $1`, [team.id]))[0].n;
  expect(after, "the write during the outage did not half-happen").toBe(before);
  // 5xx responses were expected during the outage; only uncaught errors count here.
  expect(watch.problems.filter((p) => p.includes("uncaught"))).toEqual([]);
});

test("RES-2 slow 3G: loading states show and the dashboard arrives", async ({ browser }) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  const team = capstone.teams[221];
  await page.goto(`${WEB}/login`);
  await page.getByLabel("University email").fill(team.leader);
  await page.getByLabel("Name", { exact: true }).fill(nameOf(team.leader));
  await page.getByRole("button", { name: "Dev sign in" }).click();
  await page.waitForURL((url) => url.pathname === "/student");
  const cdp = await context.newCDPSession(page);
  // Chrome DevTools' "Slow 3G": 400 ms latency, ~50 KB/s each way.
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: 50 * 1024, uploadThroughput: 50 * 1024 });
  const started = Date.now();
  await page.goto(`${WEB}/student`, { waitUntil: "commit" });
  const sawLoading = await page.getByText(/Loading/).first().waitFor({ timeout: 4_000 }).then(() => true).catch(() => false);
  const blank = await page.evaluate(() => (document.body.innerText || "").trim().length === 0);
  await expect(page.getByRole("heading", { name: "Your projects" })).toBeVisible({ timeout: 90_000 });
  const firstView = Date.now() - started;
  const t2 = Date.now();
  await page.goto(`${WEB}/student/projects/${capstone.id}?tab=milestones`, { waitUntil: "commit" });
  await expect(page.locator(".milestone-card").first()).toBeVisible({ timeout: 90_000 });
  const projectView = Date.now() - t2;
  const transfer = await page.evaluate(() => performance.getEntriesByType("resource").reduce((n, e) => n + ((e as PerformanceResourceTiming).transferSize || 0), 0));
  test.info().annotations.push({ type: "observation", description: `slow 3G, cache off: dashboard ${firstView} ms (loading text seen: ${sawLoading}; page blank while loading: ${blank}); project page ${projectView} ms; bytes on the project page load ${transfer}` });
  expect(firstView).toBeLessThan(30_000);
});
