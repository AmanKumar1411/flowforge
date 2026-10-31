import { expect, request, test } from "@playwright/test";
import { ChildProcess, execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { API, WEB, login, manifest, qaSecrets, send } from "../support/api";

// SEC-CONF and SEC-AUTH-11: headers, CORS, errors, bundle contents, dependencies, production boot.
const ROOT = path.resolve(__dirname, "../..");
const QA_DIR = path.join(ROOT, "tests/.qa");
const m = manifest();

/** Boots the compiled API with extra env on its own port; resolves with the process and its output. */
async function bootApi(port: number, env: Record<string, string>): Promise<{ proc: ChildProcess; output: () => string; up: boolean }> {
  const secrets = qaSecrets();
  let output = "";
  const proc = spawn("node", ["dist/main.js"], {
    cwd: path.join(ROOT, "backend"),
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: `postgresql://qa:${secrets.QA_DB_PASSWORD}@localhost:5433/flowforge_qa`,
      FRONTEND_URL: WEB,
      GOOGLE_REDIRECT_URI: `http://localhost:${port}/api/auth/google/callback`,
      JWT_ACCESS_SECRET: secrets.QA_JWT_SECRET,
      COOKIE_SECRET: secrets.QA_COOKIE_SECRET,
      ADMIN_BOOTSTRAP_EMAILS: m.admin,
      // Counters are shared through the database with the QA API that every other test signs in to,
      // so an API booted here is not about limits unless the test says so (SEC-ABUSE-4).
      AUTH_LOGIN_RATE_LIMIT_PER_MINUTE: "10000",
      AUTH_REFRESH_RATE_LIMIT_PER_MINUTE: "10000",
      ...env,
    },
  });
  proc.stdout?.on("data", (chunk) => (output += chunk));
  proc.stderr?.on("data", (chunk) => (output += chunk));
  const exited = new Promise<void>((resolve) => proc.on("exit", () => resolve()));
  for (let i = 0; i < 40; i += 1) {
    const done = await Promise.race([exited.then(() => true), new Promise((r) => setTimeout(() => r(false), 500))]);
    if (done) return { proc, output: () => output, up: false };
    try {
      const reply = await fetch(`http://localhost:${port}/api/auth/google`, { redirect: "manual" });
      if (reply.status > 0) return { proc, output: () => output, up: true };
    } catch {
      /* not listening yet */
    }
  }
  return { proc, output: () => output, up: false };
}



test("SEC-AUTH-11 production refuses to boot with the test login, and a production API has no test login, docs or demo accounts", async () => {
  const refused = await bootApi(3298, { NODE_ENV: "production", AUTH_DEV_LOGIN_ENABLED: "true" });
  refused.proc.kill();
  expect(refused.up).toBeFalsy();
  expect(refused.output()).toContain("AUTH_DEV_LOGIN_ENABLED must be false when NODE_ENV is production");

  const prod = await bootApi(3299, { NODE_ENV: "production", AUTH_DEV_LOGIN_ENABLED: "false" });
  try {
    expect(prod.up, prod.output().slice(-500)).toBeTruthy();
    const ctx = await request.newContext({ extraHTTPHeaders: { Origin: WEB } });
    const base = "http://localhost:3299/api";
    const devLogin = await send(ctx, "POST", `${base}/auth/dev-login`, { email: m.cycles.capstone.teams[0].leader, name: "X" });
    expect(devLogin.status).toBe(404);
    expect(devLogin.body.code).toBe("DEV_LOGIN_DISABLED");
    expect((await send(ctx, "GET", `${base}/auth/dev-login/accounts`)).status).toBe(404);
    expect((await ctx.get(`${base}/docs`)).status()).toBe(404);
    const headers = (await ctx.get(`${base}/auth/google`, { maxRedirects: 0 })).headers();
    expect(headers["strict-transport-security"]).toMatch(/max-age=\d+/);
    expect(headers["content-security-policy"]).toContain("upgrade-insecure-requests");
  } finally {
    prod.proc.kill();
  }
  // The same flag left unset also means no test login in production.
  const unset = await bootApi(3297, { NODE_ENV: "production", AUTH_DEV_LOGIN_ENABLED: "" });
  try {
    if (unset.up) {
      const ctx = await request.newContext({ extraHTTPHeaders: { Origin: WEB } });
      expect((await send(ctx, "POST", "http://localhost:3297/api/auth/dev-login", { email: m.cycles.capstone.teams[0].leader, name: "X" })).status).toBe(404);
    }
  } finally {
    unset.proc.kill();
  }
});

test("SEC-AUTH-12 a production web build refuses the test-login flag and never ships the form; a test-mode build does", async () => {
  test.setTimeout(240_000);
  const frontend = path.join(ROOT, "frontend");
  const build = (outDir: string, env: Record<string, string>, mode = "production") =>
    execSync(`npx vite build --mode ${mode} --outDir ${outDir} --emptyOutDir`, { cwd: frontend, env: { ...process.env, VITE_API_BASE_URL: "https://api.example.org/api", ...env }, stdio: "pipe" });
  const bundle = (dir: string) => fs.readdirSync(path.join(dir, "assets")).filter((f) => f.endsWith(".js")).map((f) => fs.readFileSync(path.join(dir, "assets", f), "utf8")).join("\n");

  // The flag in a production build stops the build (H12).
  let refused = "";
  try {
    build(path.join(QA_DIR, "web-refused"), { VITE_DEV_LOGIN: "true" });
  } catch (error) {
    refused = String((error as { stderr?: Buffer }).stderr ?? error);
  }
  expect(refused).toContain("VITE_DEV_LOGIN=true in a production build");

  // A plain build in a developer checkout: the flag lives in .env.development.local, which it does not read.
  const plainDir = path.join(QA_DIR, "web-prod");
  const env = { ...process.env } as Record<string, string>;
  delete env.VITE_DEV_LOGIN;
  execSync(`npx vite build --outDir ${plainDir} --emptyOutDir`, { cwd: frontend, env, stdio: "pipe" });
  expect(bundle(plainDir)).not.toContain("Dev sign in");

  // The QA stack's own build (--mode test) is the only one with the form.
  const testDir = path.join(QA_DIR, "web-default");
  build(testDir, { VITE_DEV_LOGIN: "true" }, "test");
  expect(bundle(testDir)).toContain("Dev sign in");
});

test("SEC-AUTH-11b in development the test login answers only requests from this machine, never forwarded ones", async () => {
  const dev = await bootApi(3296, { NODE_ENV: "development", AUTH_DEV_LOGIN_ENABLED: "true" });
  try {
    expect(dev.up, dev.output().slice(-500)).toBeTruthy();
    const ctx = await request.newContext({ extraHTTPHeaders: { Origin: WEB } });
    const body = { email: m.students["2024"][340], name: "Dev" };
    expect((await send(ctx, "POST", "http://localhost:3296/api/auth/dev-login", body)).status).toBe(204);
    const forwarded = await send(ctx, "POST", "http://localhost:3296/api/auth/dev-login", body, { "X-Forwarded-For": "203.0.113.5" });
    expect([forwarded.status, forwarded.body?.code]).toEqual([404, "DEV_LOGIN_DISABLED"]);
  } finally {
    dev.proc.kill();
  }
});

test("SEC-CONF-1 the bundles hold no secrets, database URLs or source maps", async () => {
  for (const dir of [path.join(QA_DIR, "web"), path.join(QA_DIR, "web-prod")]) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(path.join(dir, "assets"));
    expect(files.filter((f) => f.endsWith(".map")), `${dir} source maps`).toEqual([]);
    const js = files.filter((f) => f.endsWith(".js")).map((f) => fs.readFileSync(path.join(dir, "assets", f), "utf8")).join("\n");
    const secrets = qaSecrets();
    for (const value of Object.values(secrets)) expect(js.includes(value)).toBeFalsy();
    expect(js).not.toMatch(/postgres(ql)?:\/\/|GOCSPX-|AIza[0-9A-Za-z_-]{20,}|BEGIN (RSA )?PRIVATE KEY|client_secret|JWT_ACCESS_SECRET|COOKIE_SECRET/);
    expect(js).not.toContain("sourceMappingURL");
    // Evaluation data lives only in the database, never in static files.
    expect(js).not.toContain("Feedback for Capstone");
  }
});

test("SEC-CONF-2 security headers on API responses", async () => {
  const ctx = await request.newContext();
  const reply = await ctx.get(`${API}/auth/me`);
  const h = reply.headers();
  expect(h["x-powered-by"]).toBeUndefined();
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("SAMEORIGIN");
  expect(h["content-security-policy"]).toContain("default-src 'self'");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'self'");
  expect(h["referrer-policy"]).toBe("no-referrer");
  // HSTS is on only in production (checked in SEC-AUTH-11).
  const webReply = await ctx.get(`${WEB}/login`);
  test.info().annotations.push({ type: "observation", description: `web server (vite preview) headers: csp=${webReply.headers()["content-security-policy"] ?? "none"} xfo=${webReply.headers()["x-frame-options"] ?? "none"}` });
});

test("SEC-CONF-3 CORS allows only the web origin, with credentials", async () => {
  const ctx = await request.newContext();
  const preflight = (origin: string) => ctx.fetch(`${API}/me/dashboard`, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization" } });
  const evil = await preflight("https://evil.example");
  expect(evil.headers()["access-control-allow-origin"]).not.toBe("https://evil.example");
  expect(evil.headers()["access-control-allow-origin"]).not.toBe("*");
  const nullOrigin = await preflight("null");
  expect(nullOrigin.headers()["access-control-allow-origin"]).not.toBe("null");
  const good = await preflight(WEB);
  expect(good.headers()["access-control-allow-origin"]).toBe(WEB);
  expect(good.headers()["access-control-allow-credentials"]).toBe("true");
});

test("SEC-CONF-4 error bodies are {code, message} with no stack traces, SQL or file paths", async () => {
  const student = await login(m.cycles.capstone.teams[40].leader);
  const replies = await Promise.all([
    student.call("GET", "/does-not-exist"),
    student.call("GET", "/course-cycles/not-a-uuid"),
    student.call("POST", `/teams/${m.cycles.capstone.teams[40].id}/milestones/${m.cycles.capstone.milestones[0].id}/submissions`, { links: [] }),
    student.call("PUT", `/teams/${m.cycles.capstone.teams[40].id}/idea`, { title: "" }),
  ]);
  for (const reply of replies) {
    expect(reply.status).toBeGreaterThanOrEqual(400);
    expect(reply.status).toBeLessThan(500);
    expect(Object.keys(reply.body)).toEqual(expect.arrayContaining(["code", "message"]));
    expect(reply.text).not.toMatch(/stack|node_modules|\/src\/|\.ts:\d|prisma|SELECT|INSERT|constraint/i);
  }
  // Swagger is published outside production only (production: SEC-AUTH-11).
  const docs = await (await request.newContext()).get(`${API}/docs`);
  test.info().annotations.push({ type: "observation", description: `Swagger on the QA (NODE_ENV=test) API: ${docs.status()}` });
});

test("SEC-ABUSE-4 sign-in is limited per client IP (from the proxy when one is trusted), refresh per session, and a forged X-Forwarded-For changes nothing", async () => {
  // Counters live in the shared database, so this API gets its own client IPs through a trusted proxy.
  const limits = { AUTH_LOGIN_RATE_LIMIT_PER_MINUTE: "10", AUTH_REFRESH_RATE_LIMIT_PER_MINUTE: "10" };
  const proxied = await bootApi(3201, { NODE_ENV: "test", AUTH_DEV_LOGIN_ENABLED: "true", TRUST_PROXY: "loopback", ...limits });
  const direct = await bootApi(3203, { NODE_ENV: "test", AUTH_DEV_LOGIN_ENABLED: "true", ...limits });
  try {
    expect(proxied.up, proxied.output().slice(-500)).toBeTruthy();
    expect(direct.up, direct.output().slice(-500)).toBeTruthy();
    const n = 1 + Math.floor(Math.random() * 200);
    const [client, neighbour] = [`198.51.100.${n}`, `198.51.100.${n + 1}`];
    const ctx = await request.newContext({ extraHTTPHeaders: { Origin: WEB } });
    const login = (base: string, i: number, ip?: string) =>
      send(ctx, "POST", `${base}/auth/dev-login`, { email: m.students["2024"][300 + i], name: "Rate Limit" }, ip ? { "X-Forwarded-For": ip } : {});
    const statuses: number[] = [];
    for (let i = 0; i < 14; i += 1) statuses.push((await login("http://localhost:3201/api", i, client)).status);
    expect(statuses.slice(0, 10).every((x) => x === 204), statuses.join(",")).toBeTruthy();
    expect(statuses.slice(10)).toContain(429);
    // Another client behind the same proxy has its own budget.
    expect((await login("http://localhost:3201/api", 20, neighbour)).status).toBe(204);

    // Without a trusted proxy, X-Forwarded-For is ignored: once limited, a forged one changes nothing.
    let limited = false;
    for (let i = 0; i < 12 && !limited; i += 1) limited = (await login("http://localhost:3203/api", i)).status === 429;
    expect(limited).toBeTruthy();
    expect((await login("http://localhost:3203/api", 21, "203.0.113.9")).status).toBe(429);

    // Refresh: never per IP, per session family (10 a minute).
    const family = await request.newContext({ extraHTTPHeaders: { Origin: WEB, "X-Forwarded-For": "198.51.100.251" } });
    expect((await send(family, "POST", "http://localhost:3201/api/auth/dev-login", { email: m.students["2024"][330], name: "Family" })).status).toBe(204);
    const refreshes: number[] = [];
    for (let i = 0; i < 11; i += 1) refreshes.push((await send(family, "POST", "http://localhost:3201/api/auth/refresh")).status);
    expect(refreshes, refreshes.join(",")).toEqual([...Array(10).fill(200), 429]);
    const other = await request.newContext({ extraHTTPHeaders: { Origin: WEB, "X-Forwarded-For": "198.51.100.251" } });
    await send(other, "POST", "http://localhost:3201/api/auth/dev-login", { email: m.students["2024"][331], name: "Other" });
    expect((await send(other, "POST", "http://localhost:3201/api/auth/refresh")).status, "another session from the same IP").toBe(200);
    test.info().annotations.push({ type: "observation", description: `login statuses: ${statuses.join(",")}; one family's refreshes: ${refreshes.join(",")}` });
  } finally {
    proxied.proc.kill();
    direct.proc.kill();
  }
});

test("SEC-CONF-5 npm audit: no high or critical advisories in production dependencies", async () => {
  test.setTimeout(180_000);
  const summary: string[] = [];
  let highOrCritical = 0;
  for (const pkg of ["backend", "frontend"]) {
    for (const scope of ["--omit=dev", ""]) {
      let raw = "";
      try {
        raw = execSync(`npm audit --json ${scope}`, { cwd: path.join(ROOT, pkg), stdio: "pipe" }).toString();
      } catch (error) {
        raw = (error as { stdout?: Buffer }).stdout?.toString() ?? "{}";
      }
      const counts = JSON.parse(raw).metadata?.vulnerabilities ?? {};
      summary.push(`${pkg} ${scope || "all"}: critical ${counts.critical ?? "?"}, high ${counts.high ?? "?"}, moderate ${counts.moderate ?? "?"}, low ${counts.low ?? "?"}`);
      if (scope) highOrCritical += (counts.high ?? 0) + (counts.critical ?? 0);
    }
  }
  test.info().annotations.push({ type: "observation", description: summary.join("; ") });
  expect(highOrCritical, summary.join("\n")).toBe(0);
});
