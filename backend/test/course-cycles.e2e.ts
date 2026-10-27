import { after, before, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  BOOTSTRAP_ADMIN,
  DOMAIN,
  startTestApp,
  TestApp,
} from "./support/test-app";
import { TestBrowser } from "./support/test-browser";

// Phase 2 scenario, now signing in through dev login instead of password registration.
describe("Course cycles (Phase 2 scenario)", () => {
  let app: TestApp;
  let facultyA: TestBrowser;
  let facultyB: TestBrowser;
  let student26: TestBrowser;
  let student25: TestBrowser;

  const input = {
    courseName: "Software Design & System Development",
    title: "2026 Software Development Projects",
    description: "The first project cycle.",
    batchYear: 2026,
    semester: 7,
    academicYear: "2026-27",
    submissionStartAt: "2026-10-01T09:00:00.000Z",
    submissionDeadline: "2026-12-01T17:00:00.000Z",
  };

  before(async () => {
    app = await startTestApp();
    await app.reset();
    const admin = await app.browser().signIn(BOOTSTRAP_ADMIN);
    for (const email of [`facultya.p${DOMAIN}`, `facultyb.p${DOMAIN}`]) {
      await admin.post("/admin/faculty-allowlist", { body: { email } });
    }
    facultyA = await app.browser().signIn(`facultya.p${DOMAIN}`);
    facultyB = await app.browser().signIn(`facultyb.p${DOMAIN}`);
    student26 = await app.browser().signIn(`studenta.k26csai${DOMAIN}`);
    student25 = await app.browser().signIn(`studentb.k25csai${DOMAIN}`);
  });
  after(() => app.close());

  const ids = (body: unknown) =>
    (body as { id: string }[]).map((cycle) => cycle.id);

  it("runs the full lifecycle with ownership and batch visibility", async () => {
    const created = await facultyA.post("/course-cycles", { body: input });
    assert.equal(created.status, 201);
    const cycleId = String(created.body.id);
    const mine = await facultyA.get("/course-cycles/my");
    assert.equal(mine.status, 200);
    assert.ok(ids(mine.body).includes(cycleId));

    assert.equal(
      (await facultyA.post(`/course-cycles/${cycleId}/publish`)).status,
      200,
    );
    const visible = await student26.get("/course-cycles");
    assert.equal(visible.status, 200);
    assert.ok(ids(visible.body).includes(cycleId));
    assert.equal(
      (await student26.get(`/course-cycles/${cycleId}`)).status,
      200,
    );

    const otherBatchList = await student25.get("/course-cycles");
    assert.equal(otherBatchList.status, 200);
    assert.ok(!ids(otherBatchList.body).includes(cycleId));
    // Phase 3: a resource the caller may not see is reported as not found (was 403).
    const wrongBatch = await student25.get(`/course-cycles/${cycleId}`);
    assert.equal(wrongBatch.status, 404);
    assert.equal(wrongBatch.body.code, "CYCLE_NOT_FOUND");

    const draft = await facultyA.post("/course-cycles", { body: input });
    assert.equal(
      (await student26.get(`/course-cycles/${String(draft.body.id)}`)).status,
      404,
    );
    for (const [method, path] of [
      ["PATCH", `/course-cycles/${cycleId}`],
      ["POST", `/course-cycles/${cycleId}/publish`],
      ["POST", `/course-cycles/${cycleId}/close`],
    ]) {
      const forbidden = await facultyB.request(method, path, {
        body: method === "PATCH" ? { title: "No access" } : undefined,
      });
      assert.equal(forbidden.status, 404, `${method} ${path}`);
      assert.equal(forbidden.body.code, "CYCLE_NOT_FOUND");
    }

    assert.equal(
      (await facultyA.post(`/course-cycles/${cycleId}/close`)).status,
      200,
    );
    const closedEdit = await facultyA.patch(`/course-cycles/${cycleId}`, {
      body: { description: "No" },
    });
    assert.equal(closedEdit.status, 409);
    assert.equal(closedEdit.body.code, "CYCLE_ALREADY_CLOSED");
    assert.equal(
      (await facultyA.post(`/course-cycles/${cycleId}/publish`)).status,
      409,
    );
    assert.equal(
      (await facultyA.post(`/course-cycles/${cycleId}/close`)).status,
      409,
    );
  });

  it("lets exactly one of two concurrent publishes win", async () => {
    const draft = await facultyA.post("/course-cycles", { body: input });
    const id = String(draft.body.id);
    const race = await Promise.all([
      facultyA.post(`/course-cycles/${id}/publish`),
      facultyA.post(`/course-cycles/${id}/publish`),
    ]);
    assert.deepEqual(race.map((result) => result.status).sort(), [200, 409]);
  });

  it("keeps the { code, message } shape for validation errors", async () => {
    const invalid = await facultyA.post("/course-cycles", {
      body: { ...input, academicYear: "2026-28" },
    });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.code, "INVALID_ACADEMIC_YEAR");
    const unknownField = await facultyA.post("/course-cycles", {
      body: { ...input, status: "PUBLISHED" },
    });
    assert.equal(unknownField.status, 400);
    assert.equal(unknownField.body.code, "VALIDATION_FAILED");
  });
});
