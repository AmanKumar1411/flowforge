import { after, before, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { AddressInfo, createServer } from "node:net";
import { join } from "node:path";
import { DOMAIN, startTestApp, TestApp } from "./support/test-app";

const BACKEND = join(__dirname, "..");

/** Boots the real app in a fresh process (config validation, then module init incl. the database check). */
function boot(overrides: Record<string, string>) {
  const script =
    "require('./src/main').createApp().then((app) => app.init())" +
    ".then(() => process.exit(0), (error) => { console.error(error.message); process.exit(1); })";
  const result = spawnSync(
    process.execPath,
    ["--require", "ts-node/register/transpile-only", "-e", script],
    {
      cwd: BACKEND,
      env: { ...process.env, ...overrides },
      encoding: "utf8",
      timeout: 60_000,
    },
  );
  return { exitCode: result.status, stderr: result.stderr };
}

describe("Boot-time configuration", () => {
  it("boots with the test configuration (control case)", () => {
    assert.equal(boot({}).exitCode, 0);
  });

  it("fails fast with a clear message when the database does not answer", async () => {
    // Accepts TCP connections but never replies, like a paused Docker container.
    const silent = createServer(() => undefined);
    await new Promise<void>((resolve) =>
      silent.listen(0, "127.0.0.1", resolve),
    );
    const { port } = silent.address() as AddressInfo;
    const started = Date.now();
    const result = boot({
      DATABASE_URL: `postgresql://flowforge:secret-password@127.0.0.1:${port}/flowforge_test`,
    });
    const seconds = (Date.now() - started) / 1000;
    silent.close();

    assert.equal(result.exitCode, 1);
    assert.match(
      result.stderr,
      /Cannot reach PostgreSQL at 127\.0\.0\.1:\d+\/flowforge_test within 5s/,
    );
    assert.doesNotMatch(result.stderr, /secret-password/);
    assert.ok(seconds < 20, `gave up after ${seconds}s`);
  });

  it("refuses to start with dev login enabled in production", () => {
    const result = boot({
      NODE_ENV: "production",
      AUTH_DEV_LOGIN_ENABLED: "true",
    });
    assert.equal(result.exitCode, 1);
    assert.match(
      result.stderr,
      /AUTH_DEV_LOGIN_ENABLED must be false when NODE_ENV is production/,
    );
  });

  it("names a missing required variable", () => {
    const result = boot({ GOOGLE_CLIENT_ID: "" });
    assert.equal(result.exitCode, 1);
    assert.match(
      result.stderr,
      /Missing required environment variable: GOOGLE_CLIENT_ID/,
    );
  });

  it("refuses a student pattern without a capture group", () => {
    const result = boot({
      STUDENT_EMAIL_PATTERN:
        "^[a-z]+\\.[a-z]*\\d{2}[a-z]*@nst\\.rishihood\\.edu\\.in$",
    });
    assert.equal(result.exitCode, 1);
    assert.match(
      result.stderr,
      /STUDENT_EMAIL_PATTERN must capture the two-digit year/,
    );
  });

  it("refuses a student email in ADMIN_BOOTSTRAP_EMAILS", () => {
    const result = boot({ ADMIN_BOOTSTRAP_EMAILS: `aman.k23csai${DOMAIN}` });
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /STUDENT_EMAIL_CANNOT_BE_ELEVATED/);
  });
});

describe("Dev login switched off", () => {
  let app: TestApp;

  before(async () => {
    app = await startTestApp({ env: { AUTH_DEV_LOGIN_ENABLED: "false" } });
    await app.reset();
  });
  after(() => app.close());

  it("refuses dev login with 404 and creates nobody", async () => {
    const result = await app.browser().devLogin(`rahul.25${DOMAIN}`);
    assert.equal(result.status, 404);
    assert.equal(result.body.code, "DEV_LOGIN_DISABLED");
    assert.equal(await app.prisma.user.count(), 0);
  });

  it("still offers Google Sign-In", async () => {
    const result = await app.browser().get("/auth/google", { token: null });
    assert.equal(result.status, 302);
    assert.ok(result.location?.startsWith("https://accounts.google.com/"));
  });
});
