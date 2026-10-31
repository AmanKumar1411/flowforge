import { after, before, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { FixedClock } from "../src/common/testing/fixed-clock";
import {
  DOMAIN,
  FRONTEND_ORIGIN,
  startTestApp,
  TestApp,
} from "./support/test-app";
import { TestBrowser } from "./support/test-browser";

const MINUTE_MS = 60_000;

/** A distinct, valid student email for every n (only letters around the batch digits). */
function student(n: number): string {
  let letters = "";
  let rest = n;
  do {
    letters = String.fromCharCode(97 + (rest % 26)) + letters;
    rest = Math.floor(rest / 26);
  } while (rest > 0);
  return `campus.${letters}25${DOMAIN}`;
}

/** Runs `work` on every item, `width` at a time, keeping the order of the results. */
async function inBatches<T, R>(
  items: readonly T[],
  width: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let start = 0; start < items.length; start += width) {
    results.push(
      ...(await Promise.all(items.slice(start, start + width).map(work))),
    );
  }
  return results;
}

const range = (count: number) => Array.from({ length: count }, (_, i) => i);

/** GET /auth/google, then Google comes back to the callback for the given account. */
async function signInWithGoogle(
  app: TestApp,
  browser: TestBrowser,
  email: string,
) {
  const start = await browser.get("/auth/google", { token: null });
  assert.equal(start.status, 302);
  const authorize = new URL(start.location ?? "");
  const code = randomUUID();
  app.google.script(code, {
    sub: `google-${email}`,
    email,
    email_verified: true,
    hd: "nst.rishihood.edu.in",
    name: "Campus Student",
    nonce: authorize.searchParams.get("nonce") ?? undefined,
  });
  const query = new URLSearchParams({
    code,
    state: authorize.searchParams.get("state") ?? "",
  });
  return browser.get(`/auth/google/callback?${query}`, {
    token: null,
    origin: null,
  });
}

describe("Rate limits on /api/auth with small limits", () => {
  let app: TestApp;

  before(async () => {
    app = await startTestApp({
      env: {
        AUTH_LOGIN_RATE_LIMIT_PER_MINUTE: "3",
        AUTH_ACCOUNT_LOGIN_RATE_LIMIT_PER_MINUTE: "2",
        AUTH_REFRESH_RATE_LIMIT_PER_MINUTE: "5",
      },
    });
    await app.reset();
  });
  after(() => app.close());

  it("limits sign-in routes per IP and answers with the standard error shape", async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      statuses.push((await app.browser().devLogin(`rahul.25${DOMAIN}`)).status);
    }
    assert.deepEqual(statuses, [204, 204, 204, 429]);

    const limited = await app.browser().devLogin(`rahul.25${DOMAIN}`);
    assert.equal(limited.body.code, "TOO_MANY_REQUESTS");
  });

  it("ignores X-Forwarded-For when no proxy is trusted, so a client cannot reset its limit", async () => {
    const forged = await app.browser().request("POST", "/auth/dev-login", {
      body: { email: `rahul.25${DOMAIN}`, name: "Rahul" },
      token: null,
      headers: { "X-Forwarded-For": "203.0.113.77" },
    });
    assert.equal(forged.status, 429);
  });

  it("gives each sign-in route its own per-IP budget", async () => {
    // Dev login is exhausted above; starting Google sign-in still has 3 left.
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      statuses.push(
        (await app.browser().get("/auth/google", { token: null })).status,
      );
    }
    assert.deepEqual(statuses, [302, 302, 302, 429]);
  });

  it("never limits refresh per IP: requests without a session are each answered 401", async () => {
    const refreshes: number[] = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      refreshes.push(
        (await app.browser().post("/auth/refresh", { token: null })).status,
      );
    }
    assert.deepEqual(new Set(refreshes), new Set([401]));
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

describe("Per-account Google sign-in limit", () => {
  let app: TestApp;

  before(async () => {
    app = await startTestApp({
      env: { AUTH_ACCOUNT_LOGIN_RATE_LIMIT_PER_MINUTE: "2" },
    });
    await app.reset();
  });
  after(() => app.close());

  it("refuses a third sign-in of one Google account within a minute; other accounts sign in", async () => {
    const email = `meera.25${DOMAIN}`;
    const outcomes: string[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const callback = await signInWithGoogle(app, app.browser(), email);
      const target = new URL(callback.location ?? "");
      outcomes.push(target.pathname + target.search);
    }
    assert.deepEqual(outcomes, [
      "/auth/callback",
      "/auth/callback",
      "/login?error=TOO_MANY_REQUESTS",
    ]);
    const other = await signInWithGoogle(
      app,
      app.browser(),
      `nikhil.25${DOMAIN}`,
    );
    assert.equal(new URL(other.location ?? "").pathname, "/auth/callback");
  });
});

describe("Behind a trusted proxy", () => {
  let app: TestApp;

  before(async () => {
    app = await startTestApp({
      env: { TRUST_PROXY: "loopback", AUTH_LOGIN_RATE_LIMIT_PER_MINUTE: "2" },
    });
    await app.reset();
  });
  after(() => app.close());

  it("takes the client IP from X-Forwarded-For, so two clients have separate budgets", async () => {
    const login = (ip: string) =>
      app.browser().request("POST", "/auth/dev-login", {
        body: { email: `rahul.25${DOMAIN}`, name: "Rahul" },
        token: null,
        headers: { "X-Forwarded-For": ip },
      });
    const first: number[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      first.push((await login("198.51.100.1")).status);
    }
    assert.deepEqual(first, [204, 204, 429]);
    assert.equal((await login("198.51.100.2")).status, 204);
  });
});

describe("Campus-sized limits: thousands of students behind one IP", () => {
  const clock = new FixedClock("2026-11-02T09:00:00.000Z");
  const env = {
    AUTH_LOGIN_RATE_LIMIT_PER_MINUTE: "600",
    AUTH_REFRESH_RATE_LIMIT_PER_MINUTE: "10",
  };
  let app: TestApp;
  const signedIn: TestBrowser[] = [];

  before(async () => {
    app = await startTestApp({ clock, env });
    await app.reset();
  });
  after(() => app.close());

  it("signs in 3,000 students from one IP over five minutes; only a 601st within a minute is refused", async () => {
    for (let minute = 0; minute < 5; minute += 1) {
      const statuses = await inBatches(range(600), 30, async (i) => {
        const browser = app.browser();
        const login = await browser.devLogin(student(minute * 600 + i));
        if (login.status === 204) signedIn.push(browser);
        return login.status;
      });
      assert.deepEqual(new Set(statuses), new Set([204]), `minute ${minute}`);
      if (minute === 4) {
        const extra = await app.browser().devLogin(student(3_000));
        assert.equal(extra.status, 429);
      }
      clock.advance(MINUTE_MS);
    }
    assert.equal(signedIn.length, 3_000);
  });

  it("limits refresh per session: one family's 11th refresh in a minute is refused, 500 other families from the same IP are not", async () => {
    const [own, ...others] = signedIn;
    const statuses: number[] = [];
    for (let refresh = 0; refresh < 11; refresh += 1) {
      statuses.push((await own.refresh()).status);
    }
    assert.deepEqual(statuses, [...Array<number>(10).fill(200), 429]);
    assert.ok(
      own.cookie("flowforge_refresh"),
      "a limited refresh keeps the session",
    );

    const theirs = await inBatches(
      others.slice(0, 500),
      25,
      async (browser) => (await browser.refresh()).status,
    );
    assert.deepEqual(new Set(theirs), new Set([200]));

    clock.advance(MINUTE_MS);
    assert.equal((await own.refresh()).status, 200);
  });
});

/** POST /auth/refresh with this refresh token; returns the status and the rotated token. */
async function refreshAt(apiUrl: string, token: string) {
  const response = await fetch(`${apiUrl}/auth/refresh`, {
    method: "POST",
    headers: { Origin: FRONTEND_ORIGIN, Cookie: `flowforge_refresh=${token}` },
  });
  const rotated = response.headers
    .getSetCookie()
    .map((cookie) => /^flowforge_refresh=([^;]+)/.exec(cookie)?.[1])
    .find(Boolean);
  return { status: response.status, token: rotated ?? token };
}

describe("Two API instances on one database", () => {
  const clock = new FixedClock("2026-11-03T09:00:00.000Z");
  const env = {
    AUTH_LOGIN_RATE_LIMIT_PER_MINUTE: "3",
    AUTH_REFRESH_RATE_LIMIT_PER_MINUTE: "4",
  };
  let first: TestApp;
  let second: TestApp;

  before(async () => {
    first = await startTestApp({ clock, env });
    second = await startTestApp({ clock, env });
    await first.reset();
  });
  after(async () => {
    await first.close();
    await second.close();
  });

  it("share one sign-in budget per IP", async () => {
    const statuses = [
      (await first.browser().devLogin(`rahul.25${DOMAIN}`)).status,
      (await first.browser().devLogin(`rahul.25${DOMAIN}`)).status,
      (await second.browser().devLogin(`rahul.25${DOMAIN}`)).status,
      (await second.browser().devLogin(`rahul.25${DOMAIN}`)).status,
      (await first.browser().devLogin(`rahul.25${DOMAIN}`)).status,
    ];
    assert.deepEqual(statuses, [204, 204, 204, 429, 429]);
  });

  it("share one refresh budget per session family", async () => {
    clock.advance(MINUTE_MS);
    const browser = first.browser();
    assert.equal((await browser.devLogin(`meera.25${DOMAIN}`)).status, 204);
    let token = browser.cookie("flowforge_refresh") ?? "";
    const statuses: number[] = [];
    for (let refresh = 0; refresh < 5; refresh += 1) {
      const result = await refreshAt(
        (refresh % 2 === 0 ? first : second).apiUrl,
        token,
      );
      statuses.push(result.status);
      token = result.token;
    }
    assert.deepEqual(statuses, [200, 200, 200, 200, 429]);
  });
});
