import { after, before, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { networkInterfaces } from "node:os";
import {
  DOMAIN,
  FRONTEND_ORIGIN,
  startTestApp,
  TestApp,
} from "./support/test-app";

/** This machine's first non-loopback IPv4 address, if it has one. */
const lanAddress = Object.values(networkInterfaces())
  .flat()
  .find(
    (entry) => entry && entry.family === "IPv4" && !entry.internal,
  )?.address;

const devLogin = (base: string, headers: Record<string, string> = {}) =>
  fetch(`${base}/auth/dev-login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: FRONTEND_ORIGIN,
      ...headers,
    },
    body: JSON.stringify({ email: `meera.25${DOMAIN}`, name: "Meera" }),
  });

// H11 (SEC-F2): a server left in development with the test login on let anyone sign in as anyone.
describe("The test login in development", () => {
  let app: TestApp;
  let port = "";

  before(async () => {
    app = await startTestApp({
      host: "0.0.0.0",
      env: { NODE_ENV: "development" },
    });
    await app.reset();
    port = new URL(app.apiUrl).port;
  });
  after(() => app.close());

  it("works for a request from this machine", async () => {
    assert.equal((await devLogin(app.apiUrl)).status, 204);
    const accounts = await fetch(`${app.apiUrl}/auth/dev-login/accounts`);
    assert.equal(accounts.status, 200);
  });

  it("answers 404 to a request a proxy forwarded, even through loopback", async () => {
    const forwarded = await devLogin(app.apiUrl, {
      "X-Forwarded-For": "203.0.113.5",
    });
    assert.equal(forwarded.status, 404);
    assert.equal(
      ((await forwarded.json()) as { code: string }).code,
      "DEV_LOGIN_DISABLED",
    );
  });

  it("answers 404 to a request from another address", async (t) => {
    if (!lanAddress) {
      t.skip("this machine has no network address besides loopback");
      return;
    }
    const remote = await devLogin(`http://${lanAddress}:${port}/api`);
    assert.equal(remote.status, 404);
    const accounts = await fetch(
      `http://${lanAddress}:${port}/api/auth/dev-login/accounts`,
    );
    assert.equal(accounts.status, 404);
  });
});

describe("The test login in tests", () => {
  let app: TestApp;

  before(async () => {
    app = await startTestApp();
  });
  after(() => app.close());

  it("works through a proxy too, like the QA stack's campus proxy", async () => {
    const forwarded = await devLogin(app.apiUrl, {
      "X-Forwarded-For": "203.0.113.5",
    });
    assert.equal(forwarded.status, 204);
  });
});
