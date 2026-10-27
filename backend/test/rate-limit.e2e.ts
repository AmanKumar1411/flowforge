import { after, before, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { DOMAIN, startTestApp, TestApp } from "./support/test-app";

describe("Rate limiting on /api/auth", () => {
  let app: TestApp;

  before(async () => {
    app = await startTestApp({
      env: {
        AUTH_LOGIN_RATE_LIMIT_PER_MINUTE: "3",
        AUTH_REFRESH_RATE_LIMIT_PER_MINUTE: "5",
      },
    });
    await app.reset();
  });
  after(() => app.close());

  it("limits login routes per IP and answers with the standard error shape", async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      statuses.push((await app.browser().devLogin(`rahul.25${DOMAIN}`)).status);
    }
    assert.deepEqual(statuses, [204, 204, 204, 429]);

    const limited = await app.browser().devLogin(`rahul.25${DOMAIN}`);
    assert.equal(limited.body.code, "TOO_MANY_REQUESTS");
  });

  it("gives each login route its own per-IP budget", async () => {
    // Dev login is exhausted above; starting Google sign-in still has 3 left.
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      statuses.push(
        (await app.browser().get("/auth/google", { token: null })).status,
      );
    }
    assert.deepEqual(statuses, [302, 302, 302, 429]);
  });

  it("counts refresh separately from login", async () => {
    const browser = app.browser();
    // Logins are exhausted above; the refresh route has its own budget.
    const refreshes: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      refreshes.push(
        (await browser.post("/auth/refresh", { token: null })).status,
      );
    }
    assert.deepEqual(refreshes, [401, 401, 401, 401, 401, 429]);
  });

  it("does not throttle authenticated reads like /auth/me", async () => {
    const statuses = new Set<number>();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      statuses.add(
        (await app.browser().get("/auth/me", { token: null })).status,
      );
    }
    assert.deepEqual([...statuses], [401]);
  });
});
