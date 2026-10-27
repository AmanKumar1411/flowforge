import { after, before, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import {
  BOOTSTRAP_ADMIN,
  DOMAIN,
  startTestApp,
  TestApp,
} from "./support/test-app";
import { TestBrowser } from "./support/test-browser";

type Actor =
  | "admin"
  | "facultyOwner"
  | "otherFaculty"
  | "student"
  | "otherBatchStudent"
  | "pendingStaff"
  | "anonymous";

const ACTORS: Actor[] = [
  "admin",
  "facultyOwner",
  "otherFaculty",
  "student",
  "otherBatchStudent",
  "pendingStaff",
  "anonymous",
];

interface Case {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: () => string;
  body?: () => unknown;
  /** Unlisted signed-in actors expect 403, anonymous expects 401. */
  allowed: Partial<Record<Actor, number>>;
}

const cycleInput = {
  courseName: "Software Design",
  title: "RBAC matrix",
  batchYear: 2026,
  semester: 7,
  academicYear: "2026-27",
  submissionStartAt: "2026-10-01T09:00:00.000Z",
  submissionDeadline: "2026-12-01T17:00:00.000Z",
};

describe("RBAC matrix", () => {
  let app: TestApp;
  const browsers = new Map<Actor, TestBrowser>();
  let published = "";
  let draft = "";
  // A bystander: correcting an actor's batch would (correctly) revoke that actor's token.
  let bystanderId = "";

  before(async () => {
    app = await startTestApp();
    await app.reset();
    const admin = await app.browser().signIn(BOOTSTRAP_ADMIN);
    for (const email of [`vatsala.s${DOMAIN}`, `anil.kr${DOMAIN}`]) {
      await admin.post("/admin/faculty-allowlist", { body: { email } });
    }
    browsers.set("admin", admin);
    browsers.set(
      "facultyOwner",
      await app.browser().signIn(`vatsala.s${DOMAIN}`),
    );
    browsers.set(
      "otherFaculty",
      await app.browser().signIn(`anil.kr${DOMAIN}`),
    );
    browsers.set(
      "student",
      await app.browser().signIn(`neha.t26csai${DOMAIN}`),
    );
    browsers.set(
      "otherBatchStudent",
      await app.browser().signIn(`priya.m25csai${DOMAIN}`),
    );
    browsers.set(
      "pendingStaff",
      await app.browser().signIn(`sahil.a${DOMAIN}`),
    );
    browsers.set("anonymous", app.browser());

    const owner = browsers.get("facultyOwner")!;
    published = String(
      (await owner.post("/course-cycles", { body: cycleInput })).body.id,
    );
    await owner.post(`/course-cycles/${published}/publish`);
    draft = String(
      (await owner.post("/course-cycles", { body: cycleInput })).body.id,
    );
    const bystander = await app.browser().signIn(`ravi.b26csai${DOMAIN}`);
    bystanderId = String((await bystander.get("/auth/me")).body.id);
  });
  after(() => app.close());

  const unknownId = randomUUID();
  const cases: Case[] = [
    { method: "GET", path: () => "/admin/users", allowed: { admin: 200 } },
    {
      method: "GET",
      path: () => "/admin/faculty-allowlist",
      allowed: { admin: 200 },
    },
    {
      method: "POST",
      path: () => "/admin/faculty-allowlist",
      body: () => ({ email: `matrix.m${DOMAIN}` }),
      allowed: { admin: 201 },
    },
    {
      method: "DELETE",
      path: () => `/admin/faculty-allowlist/${unknownId}`,
      allowed: { admin: 404 },
    },
    {
      method: "GET",
      path: () => "/admin/faculty-requests?status=PENDING",
      allowed: { admin: 200 },
    },
    {
      method: "POST",
      path: () => `/admin/faculty-requests/${unknownId}/approve`,
      allowed: { admin: 404 },
    },
    {
      method: "POST",
      path: () => `/admin/faculty-requests/${unknownId}/reject`,
      allowed: { admin: 404 },
    },
    {
      method: "PATCH",
      path: () => `/admin/users/${bystanderId}/batch`,
      body: () => ({ batchYear: 2026 }),
      allowed: { admin: 200 },
    },
    {
      method: "POST",
      path: () => `/admin/users/${unknownId}/deactivate`,
      allowed: { admin: 404 },
    },
    {
      method: "POST",
      path: () => `/admin/users/${unknownId}/reactivate`,
      allowed: { admin: 404 },
    },

    {
      method: "POST",
      path: () => "/course-cycles",
      body: () => cycleInput,
      allowed: { facultyOwner: 201, otherFaculty: 201 },
    },
    {
      method: "GET",
      path: () => "/course-cycles",
      allowed: { admin: 200, student: 200, otherBatchStudent: 200 },
    },
    {
      method: "GET",
      path: () => "/course-cycles/my",
      allowed: { facultyOwner: 200, otherFaculty: 200 },
    },
    {
      method: "GET",
      path: () => `/course-cycles/${published}`,
      allowed: {
        admin: 200,
        facultyOwner: 200,
        otherFaculty: 404,
        student: 200,
        otherBatchStudent: 404,
      },
    },
    {
      method: "GET",
      path: () => `/course-cycles/${draft}`,
      allowed: {
        admin: 404,
        facultyOwner: 200,
        otherFaculty: 404,
        student: 404,
        otherBatchStudent: 404,
      },
    },
    {
      method: "PATCH",
      path: () => `/course-cycles/${published}`,
      body: () => ({ description: "Edited by the matrix" }),
      allowed: { facultyOwner: 200, otherFaculty: 404 },
    },
    {
      method: "POST",
      path: () => `/course-cycles/${draft}/publish`,
      allowed: { facultyOwner: 200, otherFaculty: 404 },
    },
    {
      method: "POST",
      path: () => `/course-cycles/${published}/close`,
      allowed: { facultyOwner: 200, otherFaculty: 404 },
    },
  ];

  for (const testCase of cases) {
    for (const actor of ACTORS) {
      const label = `${testCase.method} ${testCase.path.toString().replace(/^\(\) => /, "")}`;
      const expected =
        testCase.allowed[actor] ?? (actor === "anonymous" ? 401 : 403);
      it(`${label} as ${actor} → ${expected}`, async () => {
        const result = await browsers
          .get(actor)!
          .request(testCase.method, testCase.path(), {
            body: testCase.body?.(),
          });
        assert.equal(result.status, expected, JSON.stringify(result.body));
        if (expected === 403) {
          assert.equal(
            result.body.code,
            actor === "pendingStaff"
              ? "FACULTY_APPROVAL_PENDING"
              : "FORBIDDEN_ROLE",
          );
        }
        if (expected === 404 && testCase.path().startsWith("/course-cycles/")) {
          assert.equal(result.body.code, "CYCLE_NOT_FOUND");
        }
        if (expected === 401) {
          assert.equal(result.body.code, "UNAUTHENTICATED");
        }
      });
    }
  }
});
