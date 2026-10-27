import { after, before, beforeEach, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  auditActions,
  BOOTSTRAP_ADMIN,
  DOMAIN,
  startTestApp,
  TestApp,
} from "./support/test-app";
import { TestBrowser } from "./support/test-browser";

const cycleInput = {
  courseName: "Software Design",
  title: "Phase 3 projects",
  batchYear: 2026,
  semester: 7,
  academicYear: "2026-27",
  submissionStartAt: "2026-10-01T09:00:00.000Z",
  submissionDeadline: "2026-12-01T17:00:00.000Z",
};

describe("Faculty access", () => {
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

  const requestFor = (email: string) =>
    app.prisma.facultyAccessRequest.findFirstOrThrow({ where: { email } });

  it("signs in an allowlisted staff email as FACULTY", async () => {
    const added = await admin.post("/admin/faculty-allowlist", {
      body: { email: `Vatsala.S${DOMAIN}`, name: "Vatsala S" },
    });
    assert.equal(added.status, 201);
    assert.equal(added.body.email, `vatsala.s${DOMAIN}`);
    assert.equal(added.body.source, "MANUAL");

    const faculty = await app.browser().signIn(`vatsala.s${DOMAIN}`);
    assert.equal((await faculty.get("/auth/me")).body.role, "FACULTY");
    assert.equal((await faculty.get("/course-cycles/my")).status, 200);
  });

  it("rejects the removed faculty's existing access token on the next request", async () => {
    const entry = await admin.post("/admin/faculty-allowlist", {
      body: { email: `vatsala.s${DOMAIN}` },
    });
    const faculty = await app.browser().signIn(`vatsala.s${DOMAIN}`);
    assert.equal((await faculty.get("/course-cycles/my")).status, 200);

    const removed = await admin.delete(
      `/admin/faculty-allowlist/${entry.body.id}`,
    );
    assert.equal(removed.status, 204);

    const next = await faculty.get("/course-cycles/my");
    assert.equal(next.status, 401);
    assert.equal(next.body.code, "TOKEN_REVOKED");
    assert.equal((await faculty.refresh()).status, 200);
    const me = await faculty.get("/auth/me");
    assert.equal(me.body.role, "PENDING_STAFF");
    assert.equal(me.body.facultyRequestStatus, "REJECTED");
    assert.equal(
      (await faculty.get("/course-cycles/my")).body.code,
      "FACULTY_APPROVAL_PENDING",
    );
  });

  it("holds unlisted staff at PENDING_STAFF until an admin approves", async () => {
    for (const email of [
      `prakriti.p${DOMAIN}`,
      `sahil.a${DOMAIN}`,
      `sahil.a2${DOMAIN}`,
    ]) {
      const staff = await app.browser().signIn(email);
      assert.equal((await staff.get("/auth/me")).body.role, "PENDING_STAFF");
    }

    const staff = await app.browser().signIn(`prakriti.p${DOMAIN}`);
    assert.equal(
      await app.prisma.facultyAccessRequest.count({
        where: { email: `prakriti.p${DOMAIN}` },
      }),
      1,
      "a second login must not create a second request",
    );

    const me = await staff.get("/auth/me");
    assert.equal(me.status, 200);
    assert.equal(me.body.facultyRequestStatus, "PENDING");
    for (const [method, path] of [
      ["GET", "/course-cycles"],
      ["GET", "/course-cycles/my"],
      ["POST", "/course-cycles"],
      ["GET", "/admin/users"],
      ["GET", "/admin/faculty-requests"],
    ]) {
      const blocked = await staff.request(method, path, {
        body: method === "POST" ? cycleInput : undefined,
      });
      assert.equal(blocked.status, 403, `${method} ${path}`);
      assert.equal(
        blocked.body.code,
        "FACULTY_APPROVAL_PENDING",
        `${method} ${path}`,
      );
    }

    const pending = await admin.get<Record<string, unknown>[]>(
      "/admin/faculty-requests?status=PENDING",
    );
    assert.deepEqual(
      pending.body.map((request) => request.email).sort(),
      [`prakriti.p${DOMAIN}`, `sahil.a${DOMAIN}`, `sahil.a2${DOMAIN}`].sort(),
    );
    const request = await requestFor(`prakriti.p${DOMAIN}`);
    const approved = await admin.post(
      `/admin/faculty-requests/${request.id}/approve`,
    );
    assert.equal(approved.status, 200);
    assert.equal(approved.body.status, "APPROVED");

    // tokenVersion moved: the old token is refused, one refresh brings the new role.
    assert.equal((await staff.get("/auth/me")).body.code, "TOKEN_REVOKED");
    await staff.refresh();
    assert.equal((await staff.get("/auth/me")).body.role, "FACULTY");
    assert.equal(
      (await staff.post("/course-cycles", { body: cycleInput })).status,
      201,
    );
    const entry = await app.prisma.facultyAllowlistEntry.findUniqueOrThrow({
      where: { email: `prakriti.p${DOMAIN}` },
    });
    assert.equal(entry.source, "APPROVED_REQUEST");
    assert.deepEqual(
      (await auditActions(app.prisma))
        .map((a) => a.action)
        .filter((a) => a.startsWith("FACULTY_")),
      [
        "FACULTY_REQUEST_CREATED",
        "FACULTY_REQUEST_CREATED",
        "FACULTY_REQUEST_CREATED",
        "FACULTY_REQUEST_APPROVED",
        "FACULTY_ALLOWLIST_ADDED",
      ],
    );
  });

  it("keeps a rejected user at PENDING_STAFF and still allows a later approval", async () => {
    const staff = await app.browser().signIn(`sahil.a${DOMAIN}`);
    const request = await requestFor(`sahil.a${DOMAIN}`);

    const rejected = await admin.post(
      `/admin/faculty-requests/${request.id}/reject`,
    );
    assert.equal(rejected.body.status, "REJECTED");
    const me = await staff.get("/auth/me");
    assert.equal(me.body.role, "PENDING_STAFF");
    assert.equal(me.body.facultyRequestStatus, "REJECTED");

    // Logging in again does not reopen the request.
    await app.browser().signIn(`sahil.a${DOMAIN}`);
    assert.equal((await requestFor(`sahil.a${DOMAIN}`)).status, "REJECTED");
    assert.equal(
      (await admin.post(`/admin/faculty-requests/${request.id}/reject`)).body
        .code,
      "FACULTY_REQUEST_ALREADY_DECIDED",
    );

    assert.equal(
      (await admin.post(`/admin/faculty-requests/${request.id}/approve`))
        .status,
      200,
    );
    await staff.refresh();
    assert.equal((await staff.get("/auth/me")).body.role, "FACULTY");
  });

  it("promotes a waiting staff member as soon as an admin allowlists them", async () => {
    const staff = await app.browser().signIn(`anil.kr${DOMAIN}`);
    await admin.post("/admin/faculty-allowlist", {
      body: { email: `anil.kr${DOMAIN}` },
    });

    await staff.refresh();
    assert.equal((await staff.get("/auth/me")).body.role, "FACULTY");
    assert.equal((await requestFor(`anil.kr${DOMAIN}`)).status, "APPROVED");
    assert.equal(
      (
        await admin.post("/admin/faculty-allowlist", {
          body: { email: `anil.kr${DOMAIN}` },
        })
      ).body.code,
      "ALLOWLIST_ENTRY_EXISTS",
    );
  });

  for (const [email, code] of [
    [`aman.k23csai${DOMAIN}`, "STUDENT_EMAIL_CANNOT_BE_ELEVATED"],
    [`rahul.25${DOMAIN}`, "STUDENT_EMAIL_CANNOT_BE_ELEVATED"],
    ["prakriti.p@gmail.com", "INVALID_STAFF_EMAIL"],
    [`not-staff${DOMAIN}`, "INVALID_STAFF_EMAIL"],
  ]) {
    it(`refuses to allowlist ${email} (${code}) and audits the attempt`, async () => {
      const result = await admin.post("/admin/faculty-allowlist", {
        body: { email },
      });
      assert.equal(result.status, 400);
      assert.equal(result.body.code, code);
      assert.equal(await app.prisma.facultyAllowlistEntry.count(), 0);
      const [denied] = await auditActions(app.prisma, {
        action: "ELEVATION_DENIED",
      });
      assert.equal(denied.metadata.reason, code);
    });
  }

  it("refuses to approve a request that carries a student email", async () => {
    // Login never creates one; seed it directly to prove the approval path checks too.
    const student = await app.browser().signIn(`aman.k23csai${DOMAIN}`);
    const me = await student.get("/auth/me");
    const request = await app.prisma.facultyAccessRequest.create({
      data: { userId: String(me.body.id), email: `aman.k23csai${DOMAIN}` },
    });

    const result = await admin.post(
      `/admin/faculty-requests/${request.id}/approve`,
    );
    assert.equal(result.status, 400);
    assert.equal(result.body.code, "STUDENT_EMAIL_CANNOT_BE_ELEVATED");
    assert.equal((await requestFor(`aman.k23csai${DOMAIN}`)).status, "PENDING");
    assert.equal((await student.get("/auth/me")).body.role, "STUDENT");
    assert.equal(
      (await auditActions(app.prisma, { action: "ELEVATION_DENIED" })).length,
      1,
    );
  });
});
