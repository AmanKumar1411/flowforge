// Browser end-to-end check of the Phase 3 auth UI against the real API. See README.md.
// Usage: node auth-ui.e2e.cjs <chrome path> <frontend url> <api url> <out dir>
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright-core");
const { createCycleInWizard } = require("./support.cjs");
const [chromePath, FRONTEND, API, OUT] = process.argv.slice(2);

const DOMAIN = "@nst.rishihood.edu.in";
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
    if (page) await page.screenshot({ path: path.join(OUT, `fail-${results.length}.png`) }).catch(() => {});
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

function countRefreshes(page) {
  const counter = { count: 0 };
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url() === `${API}/auth/refresh`) counter.count += 1;
  });
  return counter;
}

const panel = (page, heading) =>
  page.locator(".admin-panel", { has: page.getByRole("heading", { name: heading }) });

(async () => {
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const fresh = () => browser.newContext();
  try {
    // --- Sign-in screen and Google redirect ---
    const visitor = await fresh();
    const login = await visitor.newPage();
    await check("Login page offers Google sign-in and the dev form", async () => {
      await login.goto(`${FRONTEND}/login`);
      const href = await login.getByRole("link", { name: "Sign in with Google" }).getAttribute("href");
      assert(href === `${API}/auth/google`, `Google link points to ${href}`);
      await login.getByLabel("University email").waitFor();
      return `href=${href}`;
    }, login);

    await check("Google button starts the server-side OAuth flow with state, nonce and PKCE", async () => {
      // Read the API's redirect instead of following it, so no request reaches Google.
      const response = await visitor.request.get(`${API}/auth/google`, { maxRedirects: 0 });
      assert(response.status() === 302, `status ${response.status()}`);
      const googleUrl = new URL(response.headers()["location"]);
      assert(googleUrl.host === "accounts.google.com", `redirects to ${googleUrl.host}`);
      const p = googleUrl.searchParams;
      assert(p.get("response_type") === "code", "response_type");
      assert(p.get("scope") === "openid email profile", `scope=${p.get("scope")}`);
      assert(p.get("hd") === "nst.rishihood.edu.in", "hd hint");
      assert(p.get("code_challenge_method") === "S256" && p.get("code_challenge"), "PKCE");
      assert(p.get("state") && p.get("nonce"), "state and nonce");
      assert(p.get("redirect_uri") === `${API}/auth/google/callback`, `redirect_uri=${p.get("redirect_uri")}`);
      const cookie = (await visitor.cookies()).find((c) => c.name === "flowforge_oauth");
      assert(cookie && cookie.httpOnly && cookie.sameSite === "Lax" && cookie.path === "/api/auth/google",
        `state cookie ${JSON.stringify(cookie)}`);
      return "302 to accounts.google.com; state cookie httpOnly, SameSite=Lax, Path=/api/auth/google";
    }, login);

    await check("A forged Google callback is refused and explained on the login page", async () => {
      await login.goto(`${API}/auth/google/callback?code=forged&state=forged`);
      await login.waitForURL(/\/login\?error=INVALID_OAUTH_STATE/);
      await login.getByText("Your sign-in expired or was started in another browser").waitFor();
    }, login);

    await check("Wrong-domain and ineligible emails are refused with clear messages", async () => {
      const page = await visitor.newPage();
      await page.goto(`${FRONTEND}/login`);
      for (const [email, message] of [
        ["someone@gmail.com", "Sign in with your @nst.rishihood.edu.in Google account."],
        [`rahul.2025${DOMAIN}`, "This email address cannot be used with FlowForge."],
      ]) {
        await page.getByLabel("University email").fill(email);
        await page.getByLabel("Name", { exact: true }).fill("Visitor");
        await page.getByRole("button", { name: "Dev sign in" }).click();
        await page.getByText(message).waitFor();
      }
      await page.close();
    });

    // --- Student ---
    const studentContext = await fresh();
    let student;
    await check("Student signs in (one refresh call despite StrictMode) and lands on their batch", async () => {
      const page = await studentContext.newPage();
      await page.goto(`${FRONTEND}/login`);
      const refreshes = countRefreshes(page);
      await page.getByLabel("University email").fill(`aman.k23csai${DOMAIN}`);
      await page.getByLabel("Name", { exact: true }).fill("Aman");
      const before = refreshes.count;
      await page.getByRole("button", { name: "Dev sign in" }).click();
      await page.waitForURL(`${FRONTEND}/student/cycles`);
      await page.locator(".role-chip", { hasText: "STUDENT" }).waitFor();
      await page.getByText("Student workspace / Batch 2023").waitFor();
      student = page;
      assert(refreshes.count - before === 1, `refresh called ${refreshes.count - before} times`);
      return "1 POST /auth/refresh after dev login";
    });

    await check("The access token is never stored by the browser; the refresh cookie is httpOnly + Strict", async () => {
      const storage = await student.evaluate(() => [
        ...Object.values(localStorage), ...Object.values(sessionStorage), document.cookie,
      ].join("|"));
      assert(!storage.includes("eyJ"), "a JWT is readable from page storage");
      const cookie = (await studentContext.cookies()).find((c) => c.name === "flowforge_refresh");
      assert(cookie && cookie.httpOnly && cookie.sameSite === "Strict" && cookie.path === "/api/auth",
        `refresh cookie ${JSON.stringify(cookie)}`);
      return "localStorage/sessionStorage/document.cookie hold no token";
    }, student);

    await check("Reloading restores the session from the refresh cookie", async () => {
      await student.reload();
      await student.locator(".role-chip", { hasText: "STUDENT" }).waitFor();
      assert(new URL(student.url()).pathname === "/student/cycles", student.url());
    }, student);

    await check("Two tabs refreshing at the same moment stay signed in (no false reuse alarm)", async () => {
      const second = await studentContext.newPage();
      await second.goto(`${FRONTEND}/student/cycles`);
      await second.locator(".role-chip").waitFor();
      await Promise.all([student.reload(), second.reload()]);
      await Promise.all([student, second].map((p) => p.locator(".role-chip", { hasText: "STUDENT" }).waitFor()));
      await second.close();
      return "both tabs still signed in";
    }, student);

    await check("A student is sent back to their own dashboard from /admin", async () => {
      await student.goto(`${FRONTEND}/admin`);
      await student.waitForURL(`${FRONTEND}/student/cycles`);
    }, student);

    // --- Pending staff and admin approval ---
    const staffContext = await fresh();
    let staff;
    await check("Unlisted staff sees 'Waiting for admin approval' and cannot open faculty screens", async () => {
      staff = await devSignIn(staffContext, `sahil.a${DOMAIN}`, "Sahil A");
      assert(new URL(staff.url()).pathname === "/pending", staff.url());
      await staff.getByRole("heading", { name: "Waiting for admin approval." }).waitFor();
      await staff.goto(`${FRONTEND}/faculty/cycles`);
      await staff.waitForURL(`${FRONTEND}/pending`);
    }, staff);

    const adminContext = await fresh();
    let admin;
    await check("Bootstrap admin lands on the admin console with pending requests first", async () => {
      admin = await devSignIn(adminContext, `coordinator.x${DOMAIN}`, "Coordinator X");
      assert(new URL(admin.url()).pathname === "/admin", admin.url());
      const first = await admin.locator(".admin-panel h2").first().textContent();
      assert(first === "Faculty access requests", `first panel is ${first}`);
      await panel(admin, "Faculty access requests").locator("tr", { hasText: `sahil.a${DOMAIN}` }).waitFor();
    }, admin);

    await check("Admin approves the request", async () => {
      const row = panel(admin, "Faculty access requests").locator("tr", { hasText: `sahil.a${DOMAIN}` });
      await row.getByRole("button", { name: "Approve" }).click();
      await row.waitFor({ state: "detached" });
    }, admin);

    await check("Approved staff becomes FACULTY on 'Check again' without signing in again", async () => {
      // Still on /pending from the earlier check; no reload, no new sign-in.
      await staff.getByRole("button", { name: "Check again" }).click();
      await staff.waitForURL(`${FRONTEND}/faculty/cycles`);
      await staff.locator(".role-chip", { hasText: "FACULTY" }).waitFor();
    }, staff);

    // --- Phase 2 screens still work behind the new auth ---
    await check("Faculty creates and publishes a cycle for batch 2023", async () => {
      // The wizard's default plan is valid as it is.
      await createCycleInWizard(staff, { courseName: "Software Design", title: "Browser E2E cycle", batchYear: 2023 });
      await staff.getByRole("button", { name: "← Back to projects" }).click();
      staff.once("dialog", (dialog) => dialog.accept());
      await staff.locator(".cycle-card", { hasText: "Browser E2E cycle" }).getByRole("button", { name: "Publish" }).click();
      await staff.locator(".cycle-card", { hasText: "Browser E2E cycle" }).locator(".status", { hasText: "Open" }).waitFor();
    }, staff);

    await check("Student of batch 2023 sees the published cycle", async () => {
      await student.goto(`${FRONTEND}/student/cycles`);
      await student.getByRole("heading", { name: "Browser E2E cycle" }).waitFor();
    }, student);

    // --- Admin actions take effect immediately ---
    await check("Admin cannot allowlist a student email", async () => {
      const allowlist = panel(admin, "Faculty allowlist");
      await allowlist.getByPlaceholder("firstname.s@nst.rishihood.edu.in").fill(`aman.k23csai${DOMAIN}`);
      await allowlist.getByRole("button", { name: "Add faculty" }).click();
      await allowlist.getByText("Student email addresses can never be given faculty or admin access.").waitFor();
    }, admin);

    await check("Batch correction applies to the student's next session (cycle for 2023 disappears)", async () => {
      await admin.reload();
      const row = panel(admin, "Users").locator("tr", { hasText: `aman.k23csai${DOMAIN}` });
      await row.locator("input[type=number]").fill("2025");
      await row.getByRole("button", { name: "Save" }).click();
      await row.getByRole("button", { name: "Save" }).waitFor({ state: "detached" });
      await student.reload();
      await student.getByText("Student workspace / Batch 2025").waitFor();
      await student.getByText("Nothing open for your batch").waitFor();
    }, student);

    await check("Deactivation ends the user's session at their next request", async () => {
      const row = panel(admin, "Users").locator("tr", { hasText: `sahil.a${DOMAIN}` });
      await row.getByRole("button", { name: "Deactivate" }).click();
      await row.getByRole("button", { name: "Reactivate" }).waitFor();
      // Opening a cycle makes an API call with the (now refused) access token.
      await staff.locator(".cycle-card", { hasText: "Browser E2E cycle" }).locator(".card-link").click();
      await staff.waitForURL(/\/login\?error=ACCOUNT_DEACTIVATED/);
      await staff.locator(".banner").getByText("Your account is deactivated. Contact the coordinator.").waitFor();
      await staff.getByLabel("University email").fill(`sahil.a${DOMAIN}`);
      await staff.getByLabel("Name", { exact: true }).fill("Sahil A");
      await staff.getByRole("button", { name: "Dev sign in" }).click();
      await staff.locator(".dev-login").getByText("Your account is deactivated. Contact the coordinator.").waitFor();
    }, staff);

    // --- Sign out ---
    await check("Sign out ends the session; a reload stays signed out", async () => {
      await student.getByRole("button", { name: "Sign out", exact: true }).click();
      await student.waitForURL(`${FRONTEND}/login`);
      await student.reload();
      await student.getByRole("link", { name: "Sign in with Google" }).waitFor();
      const cookie = (await studentContext.cookies()).find((c) => c.name === "flowforge_refresh");
      assert(!cookie, "refresh cookie still present after sign out");
    }, student);

    await check("'Sign out everywhere' also ends the session on another device", async () => {
      const otherDevice = await fresh();
      const phone = await devSignIn(otherDevice, `coordinator.x${DOMAIN}`, "Coordinator X");
      await admin.getByRole("button", { name: "Sign out everywhere" }).click();
      await admin.waitForURL(`${FRONTEND}/login`);
      await phone.reload();
      await phone.waitForURL(/\/login\?error=TOKEN_REVOKED/);
      await phone.getByText("Your session ended. Please sign in again.").waitFor();
      await otherDevice.close();
    }, admin);
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT, "browser-e2e.json"), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} browser checks passed`);
  process.exit(failed ? 1 : 0);
})();
