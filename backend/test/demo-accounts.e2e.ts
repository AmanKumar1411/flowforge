import { after, before, beforeEach, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { DemoAccountsService } from "../src/auth/application/demo-accounts.service";
import { DOMAIN, startTestApp, TestApp } from "./support/test-app";

const EXPECTED = [
  [`admin.demo${DOMAIN}`, "ADMIN", null],
  [`coordinator.x${DOMAIN}`, "ADMIN", null],
  [`coordinator.y${DOMAIN}`, "ADMIN", null],
  [`anita.sharma${DOMAIN}`, "FACULTY", null],
  [`rohit.verma${DOMAIN}`, "FACULTY", null],
  [`aarav.s23csai${DOMAIN}`, "STUDENT", 2023],
  [`diya.k23csai${DOMAIN}`, "STUDENT", 2023],
  [`ishaan.m24csai${DOMAIN}`, "STUDENT", 2024],
  [`kavya.r24csai${DOMAIN}`, "STUDENT", 2024],
  [`arjun.p25csai${DOMAIN}`, "STUDENT", 2025],
  [`sana.q25csai${DOMAIN}`, "STUDENT", 2025],
  [`vivaan.g26csai${DOMAIN}`, "STUDENT", 2026],
  [`zoya.a26csai${DOMAIN}`, "STUDENT", 2026],
] as const;

describe("Demo accounts", () => {
  let app: TestApp;
  const seed = () => app.get(DemoAccountsService).seed();

  before(async () => {
    app = await startTestApp();
  });
  after(() => app.close());
  beforeEach(() => app.reset());

  it("creates every account with its role and batch, and dev login signs into it without a second account", async () => {
    const seeded = await seed();
    assert.deepEqual(
      seeded.map(({ email, role, batchYear, outcome }) => [
        email,
        role,
        batchYear,
        outcome,
      ]),
      EXPECTED.map((row) => [...row, "CREATED"]),
    );
    assert.equal(
      await app.prisma.user.count({ where: { lastLoginAt: null } }),
      13,
    );

    for (const [email, role, batchYear] of EXPECTED) {
      const browser = await app.browser().signIn(email, "Typed Name");
      const me = await browser.get("/auth/me");
      assert.equal(me.body.role, role, email);
      assert.equal(me.body.batchYear, batchYear, email);
    }
    assert.equal(await app.prisma.user.count(), 13);
    const allowlist = await app.prisma.facultyAllowlistEntry.findMany({
      orderBy: { email: "asc" },
    });
    assert.deepEqual(
      allowlist.map((entry) => [entry.email, entry.source]),
      [
        [`anita.sharma${DOMAIN}`, "MANUAL"],
        [`rohit.verma${DOMAIN}`, "MANUAL"],
      ],
    );
  });

  it("changes nothing when run again", async () => {
    await seed();
    const audited = await app.prisma.auditLog.count();
    const again = await seed();
    assert.ok(again.every((account) => account.outcome === "UNCHANGED"));
    assert.equal(await app.prisma.user.count(), 13);
    assert.equal(await app.prisma.facultyAllowlistEntry.count(), 2);
    assert.equal(await app.prisma.auditLog.count(), audited);
  });

  it("gives back the role of demo staff who signed in before seeding, approving the faculty request", async () => {
    await app.browser().signIn(`anita.sharma${DOMAIN}`, "Anita Sharma");
    await app.browser().signIn(`coordinator.y${DOMAIN}`, "Coordinator Y");
    const before = await app.prisma.user.findMany({
      orderBy: { email: "asc" },
    });
    assert.deepEqual(
      before.map((user) => user.role),
      ["PENDING_STAFF", "PENDING_STAFF"],
    );

    const seeded = await seed();
    const outcomeOf = (email: string) =>
      seeded.find((account) => account.email === email);
    assert.deepEqual(
      [
        outcomeOf(`anita.sharma${DOMAIN}`)?.role,
        outcomeOf(`anita.sharma${DOMAIN}`)?.outcome,
      ],
      ["FACULTY", "ROLE_CHANGED"],
    );
    assert.deepEqual(
      [
        outcomeOf(`coordinator.y${DOMAIN}`)?.role,
        outcomeOf(`coordinator.y${DOMAIN}`)?.outcome,
      ],
      ["ADMIN", "ROLE_CHANGED"],
    );
    const request = await app.prisma.facultyAccessRequest.findFirstOrThrow({
      where: { email: `anita.sharma${DOMAIN}` },
    });
    assert.equal(request.status, "APPROVED");
  });

  it("leaves a deactivated demo account alone and says so", async () => {
    await seed();
    await app.prisma.user.update({
      where: { email: `kavya.r24csai${DOMAIN}` },
      data: { status: "DEACTIVATED" },
    });
    const again = await seed();
    const kavya = again.find(
      (account) => account.email === `kavya.r24csai${DOMAIN}`,
    );
    assert.equal(kavya?.outcome, "SKIPPED");
    assert.match(kavya?.note ?? "", /Deactivated/);
  });

  it("lists the accounts for the login page", async () => {
    const result = await app
      .browser()
      .get<unknown[]>("/auth/dev-login/accounts", { token: null });
    assert.equal(result.status, 200);
    assert.equal(result.body.length, 13);
    assert.deepEqual(result.body[5], {
      email: `aarav.s23csai${DOMAIN}`,
      name: "Aarav Shah",
      role: "STUDENT",
      batchYear: 2023,
    });
  });
});
