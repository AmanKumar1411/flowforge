import { after, before, beforeEach, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { createHash, randomUUID } from "node:crypto";
import { GoogleIdTokenClaims } from "../src/auth/infrastructure/google-oauth.client";
import {
  auditActions,
  BOOTSTRAP_ADMIN,
  DOMAIN,
  FRONTEND_ORIGIN,
  startTestApp,
  TestApp,
} from "./support/test-app";
import { TestBrowser } from "./support/test-browser";

type GoogleOutcome = Partial<GoogleIdTokenClaims> | Error;

interface GoogleAttempt {
  /** Overrides the state Google sends back. */
  state?: string;
  /** Replaces the signed state cookie the browser sends. */
  stateCookie?: string;
  error?: string;
}

describe("Google Sign-In", () => {
  let app: TestApp;

  before(async () => {
    app = await startTestApp();
  });
  after(() => app.close());
  beforeEach(() => app.reset());

  /** GET /auth/google, then Google redirects back to the callback with scripted claims. */
  async function signInWithGoogle(
    browser: TestBrowser,
    email: string,
    outcome: GoogleOutcome = {},
    attempt: GoogleAttempt = {},
  ) {
    const start = await browser.get("/auth/google", { token: null });
    assert.equal(start.status, 302);
    const authorize = new URL(start.location ?? "");
    const code = randomUUID();
    app.google.script(
      code,
      outcome instanceof Error
        ? outcome
        : {
            sub: `google-${email}`,
            email,
            email_verified: true,
            hd: "nst.rishihood.edu.in",
            name: email.split("@")[0],
            nonce: authorize.searchParams.get("nonce") ?? undefined,
            ...outcome,
          },
    );
    const query = new URLSearchParams(
      attempt.error
        ? { error: attempt.error }
        : {
            code,
            state: attempt.state ?? authorize.searchParams.get("state") ?? "",
          },
    );
    const callback = await browser.get(`/auth/google/callback?${query}`, {
      token: null,
      origin: null,
      cookie:
        attempt.stateCookie === undefined
          ? undefined
          : `flowforge_oauth=${attempt.stateCookie}`,
    });
    assert.equal(callback.status, 302);
    return { authorize, callback, code };
  }

  it("creates a STUDENT with the email's batch on first login and keeps tokens out of the URL", async () => {
    const browser = app.browser();
    const { callback } = await signInWithGoogle(
      browser,
      `aman.k23csai${DOMAIN}`,
    );

    assert.equal(callback.location, `${FRONTEND_ORIGIN}/auth/callback`);
    assert.ok(browser.cookie("flowforge_refresh"));
    assert.equal((await browser.refresh()).status, 200);
    const me = await browser.get("/auth/me");
    assert.equal(me.status, 200);
    assert.equal(me.body.role, "STUDENT");
    assert.equal(me.body.batchYear, 2023);

    const user = await app.prisma.user.findUniqueOrThrow({
      where: { email: `aman.k23csai${DOMAIN}` },
    });
    assert.equal(user.googleSub, `google-aman.k23csai${DOMAIN}`);
    assert.deepEqual(
      (await auditActions(app.prisma, { entityId: user.id })).map(
        (a) => a.action,
      ),
      ["USER_CREATED", "ROLE_ASSIGNED", "LOGIN_SUCCEEDED"],
    );
  });

  it("asks Google for openid email profile with PKCE and sends the matching verifier", async () => {
    const { authorize, code } = await signInWithGoogle(
      app.browser(),
      `rahul.25${DOMAIN}`,
    );

    assert.equal(authorize.searchParams.get("scope"), "openid email profile");
    assert.equal(authorize.searchParams.get("hd"), "nst.rishihood.edu.in");
    const exchange = app.google.exchanges.find((e) => e.code === code);
    assert.ok(exchange);
    assert.equal(
      authorize.searchParams.get("code_challenge"),
      createHash("sha256").update(exchange.codeVerifier).digest("base64url"),
    );
  });

  it("never overwrites an admin-corrected batch on a later login", async () => {
    const student = app.browser();
    await signInWithGoogle(student, `priya.m25csai${DOMAIN}`);
    const admin = await app.browser().signIn(BOOTSTRAP_ADMIN);
    const user = await app.prisma.user.findUniqueOrThrow({
      where: { email: `priya.m25csai${DOMAIN}` },
    });
    const corrected = await admin.patch(`/admin/users/${user.id}/batch`, {
      body: { batchYear: 2024 },
    });
    assert.equal(corrected.status, 200);

    const again = app.browser();
    await signInWithGoogle(again, `priya.m25csai${DOMAIN}`);
    await again.refresh();
    assert.equal((await again.get("/auth/me")).body.batchYear, 2024);
  });

  const denials: [string, GoogleOutcome, GoogleAttempt, string][] = [
    [
      "a hosted domain other than the university",
      { hd: "gmail.com" },
      {},
      "WRONG_HOSTED_DOMAIN",
    ],
    [
      "a personal account without a hosted domain",
      { hd: undefined },
      {},
      "WRONG_HOSTED_DOMAIN",
    ],
    [
      "an unverified email",
      { email_verified: false },
      {},
      "EMAIL_NOT_VERIFIED",
    ],
    [
      "an ID token for another audience",
      new Error("Wrong recipient, payload audience != requiredAudience"),
      {},
      "INVALID_ID_TOKEN",
    ],
    [
      "an ID token with another login's nonce",
      { nonce: "replayed-nonce" },
      {},
      "INVALID_ID_TOKEN",
    ],
    [
      "a state that does not match the cookie",
      {},
      { state: "forged-state" },
      "INVALID_OAUTH_STATE",
    ],
    [
      "a tampered state cookie",
      {},
      { stateCookie: "s%3Aforged.signature" },
      "INVALID_OAUTH_STATE",
    ],
    ["no state cookie at all", {}, { stateCookie: "" }, "INVALID_OAUTH_STATE"],
    [
      "the user cancelling on Google",
      {},
      { error: "access_denied" },
      "SIGN_IN_CANCELLED",
    ],
  ];
  for (const [label, outcome, attempt, code] of denials) {
    it(`denies ${label} with ${code} and audits it`, async () => {
      const browser = app.browser();
      const { callback } = await signInWithGoogle(
        browser,
        `vatsala.s${DOMAIN}`,
        outcome,
        attempt,
      );

      assert.equal(callback.location, `${FRONTEND_ORIGIN}/login?error=${code}`);
      assert.equal(browser.cookie("flowforge_refresh"), undefined);
      assert.equal(await app.prisma.user.count(), 0);
      const denied = await auditActions(app.prisma, { action: "LOGIN_DENIED" });
      assert.equal(denied.length, 1);
      assert.equal(denied[0].metadata.reason, code);
    });
  }

  it("identifies users by Google sub: the same email under a new sub is a conflict", async () => {
    await signInWithGoogle(app.browser(), `sahil.a${DOMAIN}`);
    const { callback } = await signInWithGoogle(
      app.browser(),
      `sahil.a${DOMAIN}`,
      {
        sub: "a-different-google-account",
      },
    );

    assert.equal(
      callback.location,
      `${FRONTEND_ORIGIN}/login?error=IDENTITY_CONFLICT`,
    );
    assert.equal(await app.prisma.user.count(), 1);
  });

  describe("a pre-registered student (ADR 012)", () => {
    const email = `zara.q24csai${DOMAIN}`;
    const preRegister = (status: "ACTIVE" | "DEACTIVATED" = "ACTIVE") =>
      app.prisma.user.create({
        data: {
          googleSub: null,
          email,
          name: "Zara Q",
          role: "STUDENT",
          status,
          batchYear: 2024,
        },
      });

    it("is claimed by the first Google sign-in with its email, keeping its id; a second Google account is still a conflict", async () => {
      const registered = await preRegister();
      const browser = app.browser();
      const { callback } = await signInWithGoogle(browser, email, {
        name: "Zara Qureshi",
      });
      assert.equal(callback.location, `${FRONTEND_ORIGIN}/auth/callback`);
      await browser.refresh();
      const me = await browser.get("/auth/me");
      assert.deepEqual(
        [me.body.id, me.body.name, me.body.batchYear],
        [registered.id, "Zara Qureshi", 2024],
      );
      const claimed = await app.prisma.user.findUniqueOrThrow({
        where: { id: registered.id },
      });
      assert.equal(claimed.googleSub, `google-${email}`);
      assert.deepEqual(
        (await auditActions(app.prisma, { entityId: registered.id })).map(
          (a) => a.action,
        ),
        ["USER_CLAIMED", "LOGIN_SUCCEEDED"],
      );

      const other = await signInWithGoogle(app.browser(), email, {
        sub: "someone-else",
      });
      assert.equal(
        other.callback.location,
        `${FRONTEND_ORIGIN}/login?error=IDENTITY_CONFLICT`,
      );
      assert.equal(await app.prisma.user.count(), 1);
    });

    it("stays unclaimed while deactivated", async () => {
      const registered = await preRegister("DEACTIVATED");
      const { callback } = await signInWithGoogle(app.browser(), email);
      assert.equal(
        callback.location,
        `${FRONTEND_ORIGIN}/login?error=ACCOUNT_DEACTIVATED`,
      );
      const after = await app.prisma.user.findUniqueOrThrow({
        where: { id: registered.id },
      });
      assert.equal(after.googleSub, null);
    });
  });
});

describe("Login eligibility (through dev login, same code path)", () => {
  let app: TestApp;

  before(async () => {
    app = await startTestApp();
  });
  after(() => app.close());
  beforeEach(() => app.reset());

  for (const [email, batchYear] of [
    [`rahul.25${DOMAIN}`, 2025],
    [`rahul.25csai${DOMAIN}`, 2025],
    [`rahul.s24csai${DOMAIN}`, 2024],
  ] as const) {
    it(`reads batch ${batchYear} from ${email}`, async () => {
      const browser = await app.browser().signIn(email);
      const me = await browser.get("/auth/me");
      assert.equal(me.body.role, "STUDENT");
      assert.equal(me.body.batchYear, batchYear);
    });
  }

  for (const email of [
    `rahul.2025${DOMAIN}`,
    `rahul.5${DOMAIN}`,
    `sahil.a123${DOMAIN}`,
  ]) {
    it(`denies ${email}, which is neither student nor staff`, async () => {
      const result = await app.browser().devLogin(email);
      assert.equal(result.status, 403);
      assert.equal(result.body.code, "EMAIL_NOT_ELIGIBLE");
      const [denied] = await auditActions(app.prisma, {
        action: "LOGIN_DENIED",
      });
      assert.equal(denied.metadata.reason, "EMAIL_NOT_ELIGIBLE");
    });
  }

  it("denies a student email whose batch is implausible", async () => {
    const result = await app.browser().devLogin(`aman.k12csai${DOMAIN}`);
    assert.equal(result.status, 400);
    assert.equal(result.body.code, "INVALID_BATCH_YEAR");
    assert.equal(await app.prisma.user.count(), 0);
  });

  it("signs in the bootstrap admin as ADMIN", async () => {
    const admin = await app.browser().signIn(BOOTSTRAP_ADMIN);
    assert.equal((await admin.get("/auth/me")).body.role, "ADMIN");
  });
});
