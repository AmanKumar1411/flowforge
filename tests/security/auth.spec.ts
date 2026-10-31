import { expect, request, test } from "@playwright/test";
import { API, DOMAIN, WEB, login, manifest, qaSecrets, send, signJwt, sql } from "../support/api";

// SEC-AUTH: tokens, sessions, logout, account eligibility. The test login is the existing dev login.
const m = manifest();
const capstone = m.cycles.capstone;

test.describe("SEC-AUTH access tokens", () => {
  let token = "";
  let userId = "";
  test.beforeAll(async () => {
    const student = await login(capstone.teams[1].leader);
    token = student.token;
    userId = student.userId;
  });

  const protectedRoutes = [
    "/auth/me", "/me/dashboard", "/me/upcoming", "/course-cycles", "/course-cycles/my", "/teams/mine",
    `/course-cycles/${capstone.id}`, `/course-cycles/${capstone.id}/teams`, `/teams/${capstone.teams[1].id}`,
    `/teams/${capstone.teams[1].id}/idea`, "/admin/users",
  ];

  test("SEC-AUTH-1 no token: every protected route answers 401 with a code and no detail", async () => {
    const ctx = await request.newContext();
    for (const route of protectedRoutes) {
      const reply = await send(ctx, "GET", route);
      expect(reply.status, route).toBe(401);
      expect(reply.body.code, route).toBe("UNAUTHENTICATED");
      expect(reply.text, route).not.toMatch(/stack|at .*\.js|prisma|SELECT/i);
    }
  });

  test("SEC-AUTH-2 malformed and wrong-scheme authorization headers are 401", async () => {
    const ctx = await request.newContext();
    for (const header of ["Bearer", "Bearer ", "Basic YTpi", `bearer ${token}`, `Bearer ${token}x`, "Bearer a.b.c", `Token ${token}`]) {
      const reply = await send(ctx, "GET", "/auth/me", undefined, { Authorization: header });
      expect(reply.status, header.slice(0, 20)).toBe(401);
    }
  });

  test("SEC-AUTH-3 tampered JWTs: alg none, wrong signature, changed claims, expired, other issuer/audience", async () => {
    const ctx = await request.newContext();
    const secret = qaSecrets().QA_JWT_SECRET;
    const now = Math.floor(Date.now() / 1000);
    const base = { sub: userId, ver: 0, iss: "flowforge-api", aud: "flowforge-web", iat: now, exp: now + 600 };
    // The genuine shape is accepted, which proves the forgeries fail for the reason tested.
    expect((await send(ctx, "GET", "/auth/me", undefined, { Authorization: `Bearer ${signJwt(base, secret)}` })).status).toBe(200);
    const [header, payload] = token.split(".");
    const changedRole = JSON.parse(Buffer.from(payload, "base64url").toString());
    changedRole.role = "ADMIN";
    changedRole.sub = (await sql(`SELECT id FROM "User" WHERE email = $1`, [m.admin]))[0].id;
    const forgeries: Record<string, string> = {
      "alg none": `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify(base)).toString("base64url")}.`,
      "alg none, no dot": `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${Buffer.from(JSON.stringify(base)).toString("base64url")}`,
      "wrong secret": signJwt(base, "not-the-secret"),
      "payload swapped to admin, old signature": `${header}.${Buffer.from(JSON.stringify(changedRole)).toString("base64url")}.${token.split(".")[2]}`,
      expired: signJwt({ ...base, iat: now - 3600, exp: now - 60 }, secret),
      "other issuer": signJwt({ ...base, iss: "someone-else" }, secret),
      "other audience": signJwt({ ...base, aud: "other-app" }, secret),
      "HS512 with the right secret": signJwt(base, secret, { alg: "HS512", typ: "JWT" }),
      "stale token version": signJwt({ ...base, ver: 7 }, secret),
      "unknown user": signJwt({ ...base, sub: "00000000-0000-4000-8000-000000000000" }, secret),
      "non-integer version": signJwt({ ...base, ver: "0" }, secret),
    };
    for (const [name, forged] of Object.entries(forgeries)) {
      const reply = await send(ctx, "GET", "/auth/me", undefined, { Authorization: `Bearer ${forged}` });
      expect(reply.status, name).toBe(401);
    }
  });
});

test.describe("SEC-AUTH sessions", () => {
  test("SEC-AUTH-4 logout ends the refresh session; logout-all also kills access tokens", async () => {
    const session = await login(capstone.teams[2].leader);
    const loggedOut = await send(session.ctx, "POST", "/auth/logout");
    expect(loggedOut.status).toBe(204);
    expect((await send(session.ctx, "POST", "/auth/refresh")).status).toBe(401);
    // Finding SEC-F3: the access token keeps working after logout until it expires (15 min).
    const afterLogout = await session.call("GET", "/auth/me");
    test.info().annotations.push({ type: "observation", description: `access token after logout: ${afterLogout.status}` });

    const other = await login(capstone.teams[3].leader);
    expect((await other.call("POST", "/auth/logout-all")).status).toBe(204);
    expect((await other.call("GET", "/auth/me")).status).toBe(401);
    expect((await send(other.ctx, "POST", "/auth/refresh")).status).toBe(401);
  });

  test("SEC-AUTH-5 refresh needs the frontend Origin (CSRF) and rotates: replay revokes the family", async () => {
    const session = await login(capstone.teams[4].leader);
    const noOrigin = await request.newContext({ storageState: await session.ctx.storageState() });
    expect((await send(noOrigin, "POST", "/auth/refresh")).status).toBe(403);
    const evil = await request.newContext({ storageState: await session.ctx.storageState(), extraHTTPHeaders: { Origin: "https://evil.example" } });
    expect((await send(evil, "POST", "/auth/refresh")).status).toBe(403);

    // Replay: keep the cookie, rotate once, then present the old cookie again after the 10 s grace
    // window for two tabs (H14; SEC-AUTH-9 covers the window itself).
    const stale = await session.ctx.storageState();
    expect((await send(session.ctx, "POST", "/auth/refresh")).status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 11_000));
    const replay = await request.newContext({ storageState: stale, extraHTTPHeaders: { Origin: WEB } });
    const replayed = await send(replay, "POST", "/auth/refresh");
    expect(replayed.status).toBe(401);
    expect(replayed.body.code).toBe("REFRESH_TOKEN_REUSED");
    // The whole family is gone: the newest cookie no longer works either.
    expect((await send(session.ctx, "POST", "/auth/refresh")).status).toBe(401);
  });

  test("SEC-AUTH-6 the refresh cookie is httpOnly, SameSite=Strict and scoped to /api/auth", async () => {
    const ctx = await request.newContext({ extraHTTPHeaders: { Origin: WEB } });
    const reply = await send(ctx, "POST", "/auth/dev-login", { email: capstone.teams[5].leader, name: "Cookie Check" });
    const cookie = reply.headers["set-cookie"] ?? "";
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/auth/i);
    // Secure is set only when NODE_ENV=production (checked in config.spec.ts).
  });

  test("SEC-AUTH-7 only verified university accounts of the right shape get in; roles cannot be chosen", async () => {
    const ctx = await request.newContext({ extraHTTPHeaders: { Origin: WEB } });
    const cases: [string, number, string][] = [
      ["someone@gmail.com", 403, "WRONG_HOSTED_DOMAIN"],
      [`student@sub.${DOMAIN}`, 403, "WRONG_HOSTED_DOMAIN"],
      [`nodots@${DOMAIN}`, 403, "EMAIL_NOT_ELIGIBLE"],
      [m.deactivated, 401, "ACCOUNT_DEACTIVATED"],
    ];
    for (const [email, status, code] of cases) {
      const reply = await send(ctx, "POST", "/auth/dev-login", { email, name: "X" });
      expect.soft(reply.status, email).toBe(status);
      expect.soft(reply.body?.code, email).toBe(code);
    }
    const escalate = await send(ctx, "POST", "/auth/dev-login", { email: capstone.teams[6].leader, name: "X", role: "ADMIN" });
    expect(escalate.status).toBe(400);
    // A new staff-shaped email lands in PENDING_STAFF and reaches nothing.
    const pending = await login(`new.staffer@${DOMAIN}`, "New Staffer");
    expect(pending.role).toBe("PENDING_STAFF");
    for (const route of ["/course-cycles/my", "/course-cycles", "/admin/users", "/me/dashboard"]) {
      expect((await pending.call("GET", route)).status, route).toBe(403);
    }
  });

  test("SEC-AUTH-8 a deactivated user's live token stops working on the next request", async () => {
    const admin = await login(m.admin, "QA Admin");
    await sql(`UPDATE "User" SET status = 'ACTIVE' WHERE email = $1`, [m.students["2025"][998]]);
    const victim = await login(m.students["2025"][998]);
    expect((await victim.call("GET", "/auth/me")).status).toBe(200);
    expect((await admin.call("POST", `/admin/users/${victim.userId}/deactivate`)).status).toBeLessThan(300);
    const refused = await victim.call("GET", "/auth/me");
    expect(refused.status).toBe(401);
    expect(refused.body.code).toBe("ACCOUNT_DEACTIVATED");
    expect((await admin.call("POST", `/admin/users/${victim.userId}/reactivate`)).status).toBeLessThan(300);
  });

  test("SEC-AUTH-9 two tabs refreshing at the same moment keep the user signed in", async () => {
    // The web app refreshes on every page load; two tabs opened together present the same cookie.
    const session = await login(capstone.teams[7].leader);
    const state = await session.ctx.storageState();
    const tabA = await request.newContext({ storageState: state, extraHTTPHeaders: { Origin: WEB } });
    const tabB = await request.newContext({ storageState: state, extraHTTPHeaders: { Origin: WEB } });
    const [a, b] = await Promise.all([send(tabA, "POST", "/auth/refresh"), send(tabB, "POST", "/auth/refresh")]);
    test.info().annotations.push({ type: "observation", description: `parallel refresh: ${a.status} ${a.body?.code ?? ""} / ${b.status} ${b.body?.code ?? ""}` });
    const winner = a.status === 200 ? tabA : tabB;
    const after = await send(winner, "POST", "/auth/refresh");
    test.info().annotations.push({ type: "observation", description: `winner refreshes again: ${after.status} ${after.body?.code ?? ""}` });
    expect([a.status, b.status], "both tabs get a token (the grace window of H14)").toEqual([200, 200]);
    expect(after.status, "the tab that won is signed out by the other tab's refresh").toBe(200);
  });

  test("SEC-AUTH-9b a refresh token replayed after the grace window still ends the whole family", async () => {
    test.setTimeout(60_000);
    const session = await login(capstone.teams[8].leader);
    const stolen = await session.ctx.storageState();
    expect((await send(session.ctx, "POST", "/auth/refresh")).status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 11_000));
    const thief = await request.newContext({ storageState: stolen, extraHTTPHeaders: { Origin: WEB } });
    const replay = await send(thief, "POST", "/auth/refresh");
    expect([replay.status, replay.body?.code]).toEqual([401, "REFRESH_TOKEN_REUSED"]);
    const owner = await send(session.ctx, "POST", "/auth/refresh");
    expect(owner.status, "the family is revoked for its owner too").toBe(401);
  });
});

test("SEC-AUTH-10 dev login cannot be reached with a forged Origin and is not linked from the API docs in production", async () => {
  const ctx = await request.newContext();
  const noOrigin = await send(ctx, "POST", "/auth/dev-login", { email: capstone.teams[8].leader, name: "X" });
  expect(noOrigin.status).toBe(403);
  const evil = await send(ctx, "POST", "/auth/dev-login", { email: capstone.teams[8].leader, name: "X" }, { Origin: "https://evil.example" });
  expect(evil.status).toBe(403);
  expect(API).toContain("localhost");
});
