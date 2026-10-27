import { after, before, beforeEach, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { JwtService } from "@nestjs/jwt";
import {
  auditActions,
  DOMAIN,
  FRONTEND_ORIGIN,
  startTestApp,
  TestApp,
} from "./support/test-app";

const STUDENT = `aman.k23csai${DOMAIN}`;

describe("Sessions", () => {
  let app: TestApp;

  before(async () => {
    app = await startTestApp();
  });
  after(() => app.close());
  beforeEach(() => app.reset());

  it("sets the refresh cookie httpOnly, SameSite=Strict, scoped to /api/auth, and stores only its hash", async () => {
    const response = await fetch(`${app.apiUrl}/auth/dev-login`, {
      method: "POST",
      headers: { Origin: FRONTEND_ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify({ email: STUDENT, name: "Aman" }),
    });
    const cookie = response.headers
      .getSetCookie()
      .find((header) => header.startsWith("flowforge_refresh="));
    assert.ok(cookie);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    assert.match(cookie, /Path=\/api\/auth(;|$)/);

    const value = cookie.split(";")[0].split("=")[1];
    const stored = await app.prisma.refreshToken.findFirstOrThrow();
    assert.notEqual(stored.tokenHash, value);
    assert.equal(
      stored.tokenHash,
      createHash("sha256").update(value).digest("hex"),
    );
  });

  it("keeps a sign-in for one day: cookie, token and family all expire 24 hours after login", async () => {
    const before = Date.now();
    const response = await fetch(`${app.apiUrl}/auth/dev-login`, {
      method: "POST",
      headers: { Origin: FRONTEND_ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify({ email: STUDENT, name: "Aman" }),
    });
    const cookie = response.headers
      .getSetCookie()
      .find((header) => header.startsWith("flowforge_refresh="));
    const expires = new Date(/Expires=([^;]+)/.exec(cookie ?? "")?.[1] ?? "");
    const stored = await app.prisma.refreshToken.findFirstOrThrow();

    const oneDay = 24 * 60 * 60 * 1000;
    for (const [label, date] of [
      ["cookie Expires", expires],
      ["token expiresAt", stored.expiresAt],
      ["family expiresAt", stored.familyExpiresAt],
    ] as const) {
      const offset = date.getTime() - before;
      // Cookie dates have one-second precision.
      assert.ok(
        offset > oneDay - 2_000 && offset < oneDay + 60_000,
        `${label} is ${offset} ms after login`,
      );
    }
  });

  it("revokes the whole family when an old refresh token is replayed", async () => {
    const browser = await app.browser().signIn(STUDENT);
    const stolen = browser.cookie("flowforge_refresh");
    assert.equal((await browser.refresh()).status, 200);

    const attacker = app.browser();
    const replay = await attacker.post("/auth/refresh", {
      token: null,
      cookie: `flowforge_refresh=${stolen}`,
    });
    assert.equal(replay.status, 401);
    assert.equal(replay.body.code, "REFRESH_TOKEN_REUSED");

    const legitimate = await browser.refresh();
    assert.equal(legitimate.status, 401);
    assert.equal(legitimate.body.code, "TOKEN_REVOKED");
    assert.equal(
      (
        await auditActions(app.prisma, {
          action: "REFRESH_TOKEN_REUSE_DETECTED",
        })
      ).length,
      1,
    );
  });

  it("logout ends this session only", async () => {
    const laptop = await app.browser().signIn(STUDENT);
    const phone = await app.browser().signIn(STUDENT);

    assert.equal(
      (await laptop.post("/auth/logout", { token: null })).status,
      204,
    );
    assert.equal(laptop.cookie("flowforge_refresh"), undefined);
    assert.equal((await phone.refresh()).status, 200);
    assert.equal(
      (await auditActions(app.prisma, { action: "LOGOUT" })).length,
      1,
    );
  });

  it("logout-all invalidates every session and every access token", async () => {
    const laptop = await app.browser().signIn(STUDENT);
    const phone = await app.browser().signIn(STUDENT);
    const phoneCookie = phone.cookie("flowforge_refresh");

    assert.equal((await laptop.post("/auth/logout-all")).status, 204);

    for (const browser of [laptop, phone]) {
      const call = await browser.get("/auth/me");
      assert.equal(call.status, 401);
      assert.equal(call.body.code, "TOKEN_REVOKED");
    }
    const phoneRefresh = await phone.post("/auth/refresh", {
      token: null,
      cookie: `flowforge_refresh=${phoneCookie}`,
    });
    assert.equal(phoneRefresh.body.code, "TOKEN_REVOKED");
    assert.equal((await laptop.refresh()).body.code, "INVALID_REFRESH_TOKEN");
    assert.equal(
      (await auditActions(app.prisma, { action: "LOGOUT_ALL" })).length,
      1,
    );
  });

  for (const route of ["/auth/refresh", "/auth/logout", "/auth/dev-login"]) {
    for (const origin of [null, "https://evil.example.com"]) {
      it(`rejects POST ${route} from origin ${origin ?? "(none)"}`, async () => {
        const browser = await app.browser().signIn(STUDENT);
        const result = await browser.post(route, {
          origin,
          token: null,
          body:
            route === "/auth/dev-login"
              ? { email: STUDENT, name: "A" }
              : undefined,
        });
        assert.equal(result.status, 403);
        assert.equal(result.body.code, "ORIGIN_NOT_ALLOWED");
      });
    }
  }

  it("rejects forged or foreign access tokens", async () => {
    const browser = await app.browser().signIn(STUDENT);
    const me = await browser.get("/auth/me");
    const claims = { sub: String(me.body.id), ver: 0 };
    const encode = (value: object) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    const jwt = new JwtService({});
    const forged = {
      "alg none": `${encode({ alg: "none", typ: "JWT" })}.${encode(claims)}.`,
      "another secret": jwt.sign(claims, {
        secret: "an-attacker-secret-that-is-long-enough-to-sign",
        issuer: "flowforge-api",
        audience: "flowforge-web",
      }),
      "another audience": jwt.sign(claims, {
        secret: process.env.JWT_ACCESS_SECRET,
        issuer: "flowforge-api",
        audience: "some-other-app",
      }),
      garbage: "not.a.token",
    };
    for (const [label, token] of Object.entries(forged)) {
      const result = await browser.get("/auth/me", { token });
      assert.equal(result.status, 401, label);
      assert.equal(result.body.code, "UNAUTHENTICATED", label);
    }
  });

  it("keeps the audit log append-only at the database level", async () => {
    await app.browser().signIn(STUDENT);
    await assert.rejects(
      app.prisma.$executeRawUnsafe(`UPDATE "AuditLog" SET "entityId" = 'x'`),
      /append-only/,
    );
    await assert.rejects(
      app.prisma.$executeRawUnsafe(`DELETE FROM "AuditLog"`),
      /append-only/,
    );
  });
});
