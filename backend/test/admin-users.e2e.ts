import { after, before, beforeEach, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  auditActions,
  BOOTSTRAP_ADMIN,
  DOMAIN,
  startTestApp,
  TestApp,
} from "./support/test-app";
import { HttpResult, TestBrowser } from "./support/test-browser";

describe("User administration", () => {
  let app: TestApp;
  let admin: TestBrowser;

  before(async () => {
    app = await startTestApp();
  });
  after(() => app.close());
  beforeEach(async () => {
    await app.reset();
    admin = await app.browser().signIn(BOOTSTRAP_ADMIN);
  });

  const idOf = async (browser: TestBrowser) =>
    String((await browser.get("/auth/me")).body.id);

  it("deactivation rejects the user's access token immediately and blocks refresh and login", async () => {
    const student = await app.browser().signIn(`aman.k23csai${DOMAIN}`);
    const studentId = await idOf(student);

    const deactivated = await admin.post(
      `/admin/users/${studentId}/deactivate`,
    );
    assert.equal(deactivated.status, 200);
    assert.equal(deactivated.body.status, "DEACTIVATED");

    const call = await student.get("/course-cycles");
    assert.equal(call.status, 401);
    assert.equal(call.body.code, "ACCOUNT_DEACTIVATED");
    assert.equal((await student.refresh()).status, 401);
    const login = await app.browser().devLogin(`aman.k23csai${DOMAIN}`);
    assert.equal(login.status, 401);
    assert.equal(login.body.code, "ACCOUNT_DEACTIVATED");
    assert.equal(
      (await auditActions(app.prisma, { action: "USER_DEACTIVATED" })).length,
      1,
    );

    assert.equal(
      (await admin.post(`/admin/users/${studentId}/reactivate`)).body.status,
      "ACTIVE",
    );
    assert.equal(
      (await app.browser().devLogin(`aman.k23csai${DOMAIN}`)).status,
      204,
    );
  });

  it("does not let an admin deactivate themselves", async () => {
    const result = await admin.post(
      `/admin/users/${await idOf(admin)}/deactivate`,
    );
    assert.equal(result.status, 409);
    assert.equal(result.body.code, "CANNOT_DEACTIVATE_SELF");
  });

  it("corrects a student's batch, audits it and revokes their current token", async () => {
    const student = await app.browser().signIn(`priya.m25csai${DOMAIN}`);
    const studentId = await idOf(student);

    const corrected = await admin.patch(`/admin/users/${studentId}/batch`, {
      body: { batchYear: 2024 },
    });
    assert.equal(corrected.status, 200);
    assert.equal(corrected.body.batchYear, 2024);

    assert.equal((await student.get("/auth/me")).body.code, "TOKEN_REVOKED");
    await student.refresh();
    assert.equal((await student.get("/auth/me")).body.batchYear, 2024);
    const [event] = await auditActions(app.prisma, {
      action: "USER_BATCH_CORRECTED",
    });
    assert.deepEqual(event.metadata, { from: 2025, to: 2024 });
  });

  it("validates batch corrections", async () => {
    const student = await app.browser().signIn(`priya.m25csai${DOMAIN}`);
    const studentId = await idOf(student);
    const staff = await app.browser().signIn(`sahil.a${DOMAIN}`);

    const outOfRange = await admin.patch(`/admin/users/${studentId}/batch`, {
      body: { batchYear: 2099 },
    });
    assert.equal(outOfRange.body.code, "INVALID_BATCH_YEAR");
    const notStudent = await admin.patch(
      `/admin/users/${await idOf(staff)}/batch`,
      {
        body: { batchYear: 2024 },
      },
    );
    assert.equal(notStudent.body.code, "USER_NOT_A_STUDENT");
    const unknown = await admin.patch(
      "/admin/users/00000000-0000-4000-8000-000000000000/batch",
      { body: { batchYear: 2024 } },
    );
    assert.equal(unknown.status, 404);
    assert.equal(unknown.body.code, "USER_NOT_FOUND");
  });

  it("lists users with filters and cursor pagination", async () => {
    for (const email of [
      `aman.k23csai${DOMAIN}`,
      `rahul.s24csai${DOMAIN}`,
      `neha.t24csai${DOMAIN}`,
      `ravi.b24csai${DOMAIN}`,
      `sahil.a${DOMAIN}`,
    ]) {
      await app.browser().signIn(email);
    }

    type Page = { items: { email: string }[]; nextCursor: string | null };
    const batch2024: string[] = [];
    let cursor: string | null = null;
    do {
      const query: URLSearchParams = new URLSearchParams({
        role: "STUDENT",
        batchYear: "2024",
        limit: "2",
        ...(cursor ? { cursor } : {}),
      });
      const page: HttpResult<Page> = await admin.get<Page>(
        `/admin/users?${query}`,
      );
      assert.equal(page.status, 200);
      batch2024.push(...page.body.items.map((user) => user.email));
      cursor = page.body.nextCursor;
    } while (cursor);

    assert.deepEqual(batch2024.sort(), [
      `neha.t24csai${DOMAIN}`,
      `rahul.s24csai${DOMAIN}`,
      `ravi.b24csai${DOMAIN}`,
    ]);
    const invalid = await admin.get("/admin/users?role=OWNER");
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.code, "VALIDATION_FAILED");
  });
});
