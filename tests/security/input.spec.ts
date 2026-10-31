import { expect, request, test } from "@playwright/test";
import { API, Session, WEB, login, manifest, send, sql } from "../support/api";

// SEC-INJ, SEC-LINK, SEC-ABUSE: hostile input through every writable field.
const m = manifest();
const { capstone, web, design } = m.cycles;
const designFree = m.students["2025"].slice(820, 850); // enrolled in the design elective, no team yet

const SQLI = ["' OR '1'='1", "'; DROP TABLE \"User\"; --", "\" OR 1=1 --", "1' UNION SELECT email, null FROM \"User\"--", "$1; SELECT pg_sleep(5)--"];
const XSS = ["<img src=x onerror=alert(1)>", "<script>alert(1)</script>", "\"><svg onload=alert(1)>", "javascript:alert(1)", "{{constructor.constructor('alert(1)')()}}"];
const noLeak = (text: string) => expect(text).not.toMatch(/stack|node_modules|\.ts:\d|prisma|SELECT |syntax error|QueryFailed|PrismaClient/i);

test("SEC-INJ-1 SQL injection strings in names, search and ideas are stored as text or refused, never executed", async () => {
  const leader = await login(designFree[0]);
  const partner = await login(designFree[1]);
  const created = await leader.call("POST", `/course-cycles/${design.id}/teams`, { name: "Plain team", memberIds: [partner.userId] });
  expect(created.status).toBe(201);
  const teamId = created.body.id;
  for (const payload of SQLI) {
    const renamed = await leader.call("PATCH", `/teams/${teamId}`, { name: payload.slice(0, 60) });
    expect([200, 400], payload).toContain(renamed.status);
    if (renamed.status !== 200) noLeak(renamed.text);
    if (renamed.status === 200) expect(renamed.body.name).toBe(payload.slice(0, 60));
    const search = await leader.call("GET", `/course-cycles/${design.id}/team-candidates?q=${encodeURIComponent(payload)}`);
    expect([200, 400], `search ${payload}`).toContain(search.status);
    if (search.status !== 200) noLeak(search.text);
  }
  const admin = await login(m.admin, "QA Admin");
  for (const query of ["role=STUDENT'--", "batchYear=2023 OR 1=1", "cursor=' OR 1=1--", "status=ACTIVE;DROP"]) {
    const reply = await admin.call("GET", `/admin/users?${query}`);
    expect(reply.status, query).toBe(400);
    noLeak(reply.text);
  }
  const leaderWeb = await login(web.teams[185].leader);
  const idea = await leaderWeb.call("PUT", `/teams/${web.teams[185].id}/idea`, { title: SQLI[1], problem: SQLI[3], solution: SQLI[4] });
  expect(idea.status).toBeLessThan(300);
  expect(idea.body.idea?.title ?? idea.body.title).toBe(SQLI[1]);
  // The tables are all still there and the user count did not change.
  expect((await sql(`SELECT count(*)::int AS n FROM "User"`))[0].n).toBeGreaterThanOrEqual(3022);
});

test("SEC-INJ-2 stored XSS payloads come back as plain text and never run in the browser", async ({ page }) => {
  // Store payloads where other people read them: team name (faculty), idea (faculty), evaluation feedback (students).
  const leader = await login(designFree[2]);
  const partner = await login(designFree[3]);
  const team = await leader.call("POST", `/course-cycles/${design.id}/teams`, { name: XSS[0], memberIds: [partner.userId] });
  expect(team.status).toBe(201);
  const leaderWeb = await login(web.teams[186].leader);
  const idea = await leaderWeb.call("PUT", `/teams/${web.teams[186].id}/idea`, { title: XSS[1], problem: XSS[2], solution: XSS[4] });
  expect(idea.status).toBeLessThan(300);
  const alpha = await login(capstone.owner);
  const target = capstone.teams[30];
  const grading = await alpha.call("GET", `/course-cycles/${capstone.id}/milestones/${capstone.milestones[0].id}/grading`);
  const row = grading.body.rows.find((r: { team: { id: string } }) => r.team.id === target.id);
  const saved = await alpha.call("PUT", `/course-cycles/${capstone.id}/milestones/${capstone.milestones[0].id}/teams/${target.id}/evaluation`, {
    marks: 70, feedback: `${XSS[0]} ${XSS[1]} ${XSS[2]}`, expectedVersion: row.evaluation.version,
  });
  expect(saved.status).toBe(200);

  const dialogs: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  const signIn = async (email: string) => {
    await page.context().clearCookies();
    await page.goto(`${WEB}/login`);
    await page.getByLabel("University email").fill(email);
    await page.getByLabel("Name", { exact: true }).fill("XSS Check");
    await page.getByRole("button", { name: "Dev sign in" }).click();
    await page.waitForURL((url) => !["/login", "/auth/callback"].includes(url.pathname));
  };
  await signIn(target.members[1]);
  await page.goto(`${WEB}/student/projects/${capstone.id}?tab=milestones`);
  await expect(page.getByText(XSS[0], { exact: false }).first()).toBeVisible();
  await signIn(design.owner);
  await page.goto(`${WEB}/faculty/cycles/${design.id}?tab=teams`);
  await expect(page.getByText(XSS[0]).first()).toBeVisible();
  await signIn(web.owner);
  await page.goto(`${WEB}/faculty/cycles/${web.id}?tab=ideas`);
  await page.waitForLoadState("networkidle");
  expect(dialogs).toEqual([]);
  expect(await page.evaluate(() => document.querySelectorAll("img[src='x'], svg[onload]").length)).toBe(0);
});

test("SEC-INJ-3 malformed, oversized, nested and wrongly typed bodies are refused with 4xx and no internals", async () => {
  const leader = await login(designFree[4]);
  const route = `${API}/course-cycles/${design.id}/teams`;
  const raw = async (body: string, contentType = "application/json") => {
    const r = await leader.ctx.fetch(route, { method: "POST", headers: { Authorization: `Bearer ${leader.token}`, "Content-Type": contentType }, data: body });
    return { status: r.status(), text: await r.text() };
  };
  const cases: [string, string, string?][] = [
    ["malformed", "{\"name\": \"x\","],
    ["array", "[1,2,3]"],
    ["null", "null"],
    ["number name", "{\"name\": 12, \"memberIds\": []}"],
    ["too long name", JSON.stringify({ name: "x".repeat(61), memberIds: [] })],
    ["11 members", JSON.stringify({ name: "x", memberIds: Array.from({ length: 11 }, (_, i) => `00000000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`) })],
    ["2 MB body", JSON.stringify({ name: "x", memberIds: [], pad: "y".repeat(2_000_000) })],
    ["deep nesting", `${"{\"a\":".repeat(5000)}1${"}".repeat(5000)}`],
    ["prototype pollution", "{\"name\":\"x\",\"memberIds\":[],\"__proto__\":{\"role\":\"ADMIN\"}}"],
    ["constructor pollution", "{\"name\":\"x\",\"memberIds\":[],\"constructor\":{\"prototype\":{\"role\":\"ADMIN\"}}}"],
    ["text/plain", "name=x", "text/plain"],
    ["form encoded", "name=x&memberIds=", "application/x-www-form-urlencoded"],
  ];
  const results: string[] = [];
  for (const [label, body, type] of cases) {
    const reply = await raw(body, type);
    results.push(`${label}: ${reply.status}`);
    expect.soft(reply.status, label).toBeGreaterThanOrEqual(400);
    expect.soft(reply.status, label).toBeLessThan(500);
    noLeak(reply.text);
  }
  test.info().annotations.push({ type: "observation", description: results.join("; ") });
  // The app still answers normally afterwards.
  expect((await leader.call("GET", "/auth/me")).status).toBe(200);
});

test("SEC-INJ-4 control characters (NUL) in text fields are refused, not a 500", async () => {
  const leader = await login(designFree[6]);
  const partner = await login(designFree[7]);
  const reply = await leader.call("POST", `/course-cycles/${design.id}/teams`, { name: "nul\u0000byte", memberIds: [partner.userId] });
  test.info().annotations.push({ type: "observation", description: `team name with NUL: ${reply.status} ${reply.text.slice(0, 200)}` });
  noLeak(reply.text);
  expect(reply.status).toBe(400);
});

test("SEC-INJ-5 header injection: CRLF and a forged Host do not change redirects or cookies", async () => {
  const ctx = await request.newContext({ maxRedirects: 0 });
  const callback = await ctx.get(`${API}/auth/google/callback?error=x%0d%0aSet-Cookie:%20pwned=1&state=a`, { maxRedirects: 0 });
  expect(callback.status()).toBeLessThan(500);
  expect(callback.headers()["set-cookie"] ?? "").not.toContain("pwned");
  const location = callback.headers()["location"] ?? "";
  expect(location.startsWith(WEB)).toBeTruthy();
  const start = await ctx.get(`${API}/auth/google`, { headers: { Host: "evil.example", "X-Forwarded-Host": "evil.example" }, maxRedirects: 0 });
  expect(start.status()).toBe(302);
  const google = new URL(start.headers()["location"]);
  expect(google.hostname).toBe("accounts.google.com");
  expect(google.searchParams.get("redirect_uri") ?? "").not.toContain("evil.example");
  // A newline in the user agent cannot reach the stored session or the response.
  const name = await send(await request.newContext({ extraHTTPHeaders: { Origin: WEB } }), "POST", "/auth/dev-login", { email: designFree[8], name: "Line\r\nSet-Cookie: x=1" });
  expect(name.status).toBe(204);
  expect(name.headers["set-cookie"] ?? "").not.toMatch(/x=1/);
});

test.describe("SEC-LINK submission links", () => {
  let member: Session;
  const team = capstone.teams[200];
  const m2 = capstone.milestones[1].id;
  test.beforeAll(async () => {
    member = await login(team.members[1]);
  });
  const github = (url: string) => ({ links: [{ type: "GITHUB", url }] });
  const withDemo = (url: string) => ({ links: [{ type: "GITHUB", url: "https://github.com/qa/ok" }, { type: "DEMO", url }] });

  const refused: [string, unknown][] = [
    ["GitHub look-alike host", github("https://github.com.evil.example/a/b")],
    ["GitHub over http", github("http://github.com/a/b")],
    ["GitHub without a repository", github("https://github.com/onlyowner")],
    ["gist instead of a repository", github("https://gist.github.com/a/b")],
    ["javascript: URL", github("javascript:alert(1)//https://github.com/a/b")],
    ["data: URL as demo", withDemo("data:text/html,<script>alert(1)</script>")],
    ["file: URL as demo", withDemo("file:///etc/passwd")],
    ["localhost demo", withDemo("https://localhost/admin")],
    ["IPv6 loopback demo", withDemo("https://[::1]/")],
    ["Drive look-alike", { links: [{ type: "GITHUB", url: "https://github.com/qa/ok" }, { type: "REPORT", url: "javascript:alert(1)" }] }],
    ["link type the milestone does not take", { links: [{ type: "GITHUB", url: "https://github.com/qa/ok" }, { type: "DRIVE", url: "https://drive.google.com/x" }] }],
    ["same type twice", { links: [{ type: "GITHUB", url: "https://github.com/qa/a" }, { type: "GITHUB", url: "https://github.com/qa/b" }] }],
    ["unknown type", { links: [{ type: "FTP", url: "ftp://example.org/x" }] }],
    ["missing required GitHub", { links: [{ type: "DEMO", url: "https://demo.example.org" }] }],
  ];
  for (const [label, body] of refused) {
    test(`SEC-LINK refuses: ${label}`, async () => {
      const reply = await member.call("POST", `/teams/${team.id}/milestones/${m2}/submissions`, body);
      expect(reply.status, reply.text.slice(0, 200)).toBe(400);
      expect(reply.body.message.length).toBeGreaterThan(10);
    });
  }

  // The API never fetches links (no server-side SSRF), but faculty open them: private and metadata addresses should not be accepted.
  const internal: [string, unknown][] = [
    ["loopback IPv4 demo", withDemo("https://127.0.0.1/admin")],
    ["cloud metadata demo", withDemo("https://169.254.169.254/latest/meta-data/")],
    ["private network demo", withDemo("https://10.0.0.5:8080/")],
    ["credentials in a GitHub URL", github("https://user:token@github.com/qa/repo")],
  ];
  for (const [label, body] of internal) {
    test(`SEC-LINK internal or credentialed URL: ${label}`, async () => {
      const reply = await member.call("POST", `/teams/${team.id}/milestones/${m2}/submissions`, body);
      test.info().annotations.push({ type: "observation", description: `${label}: ${reply.status}` });
      expect(reply.status).toBe(400);
    });
  }

  test("SEC-LINK catalog links: javascript: refused; http:// observed", async () => {
    const charlie = await login(web.owner);
    const js = await charlie.call("POST", `/course-cycles/${web.id}/idea-catalog`, { title: "JS link", description: "x", link: "javascript:alert(1)" });
    expect(js.status).toBe(400);
    const http = await charlie.call("POST", `/course-cycles/${web.id}/idea-catalog`, { title: "Plain http link", description: "x", link: "http://example.org/brief" });
    test.info().annotations.push({ type: "observation", description: `catalog http:// link: ${http.status}` });
  });
});

test("SEC-ABUSE-1 a member can post many submission versions in a burst (no per-user write limit)", async () => {
  const team = capstone.teams[201];
  const member = await login(team.members[2]);
  const m2 = capstone.milestones[1].id;
  const started = Date.now();
  const replies = await Promise.all(Array.from({ length: 100 }, (_, i) =>
    member.call("POST", `/teams/${team.id}/milestones/${m2}/submissions`, { links: [{ type: "GITHUB", url: `https://github.com/qa/spam${i}` }] })));
  const accepted = replies.filter((r) => r.status === 201).length;
  const throttled = replies.filter((r) => r.status === 429).length;
  test.info().annotations.push({ type: "observation", description: `100 submissions in ${Date.now() - started} ms: ${accepted} accepted, ${throttled} throttled, others ${replies.filter((r) => ![201, 429].includes(r.status)).map((r) => r.status).join(",")}` });
  expect(replies.every((r) => r.status < 500)).toBeTruthy();
  expect(throttled, "authenticated writes have no rate limit").toBeGreaterThan(0);
});

test("SEC-ABUSE-2 pagination and search are bounded; the candidate search shows only the student's own batch", async () => {
  const admin = await login(m.admin, "QA Admin");
  expect((await admin.call("GET", "/admin/users?limit=100000")).status).toBe(400);
  expect((await admin.call("GET", "/admin/users?limit=0")).status).toBe(400);
  const page = await admin.call("GET", "/admin/users?limit=100");
  expect(page.status).toBe(200);
  const rows = Array.isArray(page.body) ? page.body : page.body.users ?? page.body.items ?? [];
  expect(rows.length).toBeLessThanOrEqual(100);
  const student = await login(designFree[10]);
  expect((await student.call("GET", `/course-cycles/${design.id}/team-candidates?q=a`)).status).toBe(400);
  const found = await student.call("GET", `/course-cycles/${design.id}/team-candidates?q=aa`);
  expect(found.status).toBe(200);
  const text = JSON.stringify(found.body);
  expect(text).not.toMatch(/23@|24@/);
  const count = (Array.isArray(found.body) ? found.body : found.body.candidates ?? []).length;
  test.info().annotations.push({ type: "observation", description: `candidate search "aa" returned ${count} rows; fields: ${Object.keys((Array.isArray(found.body) ? found.body : found.body.candidates ?? [])[0] ?? {}).join(",")}` });
  expect(count).toBeLessThanOrEqual(50);
});

test("SEC-ABUSE-3 huge strings at the limits: 4,000-char notes accepted, 4,001 refused", async () => {
  const team = capstone.teams[202];
  const member = await login(team.members[1]);
  const m2 = capstone.milestones[1].id;
  const ok = await member.call("POST", `/teams/${team.id}/milestones/${m2}/submissions`, { links: [{ type: "GITHUB", url: "https://github.com/qa/notes" }], notes: "n".repeat(4000) });
  expect(ok.status).toBe(201);
  const tooLong = await member.call("POST", `/teams/${team.id}/milestones/${m2}/submissions`, { links: [{ type: "GITHUB", url: "https://github.com/qa/notes" }], notes: "n".repeat(4001) });
  expect(tooLong.status).toBe(400);
  const url = await member.call("POST", `/teams/${team.id}/milestones/${m2}/submissions`, { links: [{ type: "GITHUB", url: `https://github.com/qa/${"r".repeat(600)}` }] });
  expect(url.status).toBe(400);
});
