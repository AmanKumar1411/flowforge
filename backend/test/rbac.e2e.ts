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
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: () => string;
  body?: () => unknown;
  /** Unlisted signed-in actors expect 403, anonymous expects 401. */
  allowed: Partial<Record<Actor, number>>;
  /** The code of a 404; by default CYCLE_NOT_FOUND under /course-cycles and TEAM_NOT_FOUND under /teams. */
  notFound?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const inDays = (days: number) =>
  new Date(Date.now() + days * DAY_MS).toISOString();

// Relative dates: team formation (default: until submissions open) must still be open.
const cycleInput = {
  courseName: "Software Design",
  title: "RBAC matrix",
  batchYear: 2026,
  semester: 7,
  academicYear: "2026-27",
  submissionStartAt: inDays(7),
  submissionDeadline: inDays(30),
};

describe("RBAC matrix", () => {
  let app: TestApp;
  const browsers = new Map<Actor, TestBrowser>();
  let published = "";
  let draft = "";
  // An elective with only the "student" actor enrolled.
  let elective = "";
  // A bystander: correcting an actor's batch would (correctly) revoke that actor's token.
  let bystanderId = "";
  // The bystander's team: no actor in the matrix is a member of it.
  let bystanderTeam = "";

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
    elective = String(
      (
        await owner.post("/course-cycles", {
          body: { ...cycleInput, title: "Elective", kind: "ELECTIVE" },
        })
      ).body.id,
    );
    await owner.post(`/course-cycles/${elective}/publish`);
    await owner.post(`/course-cycles/${elective}/enrollments`, {
      body: { emails: [`neha.t26csai${DOMAIN}`] },
    });
    const bystander = await app.browser().signIn(`ravi.b26csai${DOMAIN}`);
    bystanderId = String((await bystander.get("/auth/me")).body.id);
    bystanderTeam = String(
      (
        await bystander.post(`/course-cycles/${published}/teams`, {
          body: { name: "Bystanders", memberIds: [] },
        })
      ).body.id,
    );
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
      method: "GET",
      path: () => `/course-cycles/${elective}`,
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
      path: () => `/course-cycles/${elective}/enrollments`,
      allowed: { facultyOwner: 200, otherFaculty: 404 },
    },
    {
      method: "POST",
      path: () => `/course-cycles/${elective}/enrollments`,
      body: () => ({ emails: [`matrix.m26csai${DOMAIN}`] }),
      allowed: { facultyOwner: 201, otherFaculty: 404 },
    },
    {
      method: "DELETE",
      path: () =>
        `/course-cycles/${elective}/enrollments/${encodeURIComponent(`nobody.n26csai${DOMAIN}`)}`,
      allowed: { facultyOwner: 404, otherFaculty: 404 },
      notFound: "*",
    },
    {
      method: "GET",
      path: () => `/course-cycles/${published}/looking-for-team`,
      allowed: { student: 200, otherBatchStudent: 404 },
    },
    {
      method: "PUT",
      path: () => `/course-cycles/${published}/looking-for-team`,
      body: () => ({ note: "Matrix" }),
      allowed: { student: 204, otherBatchStudent: 404 },
    },
    {
      method: "DELETE",
      path: () => `/course-cycles/${published}/looking-for-team`,
      allowed: { student: 204, otherBatchStudent: 404 },
    },
    {
      method: "GET",
      path: () => `/course-cycles/${published}/team-completion`,
      allowed: { admin: 200, facultyOwner: 200, otherFaculty: 404 },
    },
    // Formation is still open in the matrix cycle, so the owner's completion tools answer 409.
    {
      method: "POST",
      path: () => `/course-cycles/${published}/team-completion/teams`,
      body: () => ({ name: "Matrix", leaderId: bystanderId, memberIds: [] }),
      allowed: { facultyOwner: 409, otherFaculty: 404 },
    },
    {
      method: "POST",
      path: () =>
        `/course-cycles/${published}/team-completion/auto-group/preview`,
      allowed: { facultyOwner: 409, otherFaculty: 404 },
    },
    {
      method: "POST",
      path: () => `/course-cycles/${published}/team-completion/auto-group`,
      body: () => ({
        teams: [{ name: "Matrix", leaderId: bystanderId, memberIds: [] }],
      }),
      allowed: { facultyOwner: 409, otherFaculty: 404 },
    },
    {
      method: "POST",
      path: () => `/teams/${bystanderTeam}/members`,
      body: () => ({ userId: bystanderId }),
      allowed: { facultyOwner: 409, otherFaculty: 404 },
    },

    {
      method: "POST",
      path: () => `/course-cycles/${published}/teams`,
      body: () => ({ name: "Matrix", memberIds: [] }),
      allowed: { student: 201, otherBatchStudent: 404 },
    },
    {
      method: "GET",
      path: () => `/course-cycles/${published}/teams`,
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
      path: () => `/course-cycles/${published}/team-candidates?q=ra`,
      allowed: { student: 200, otherBatchStudent: 404 },
    },
    {
      method: "GET",
      path: () => "/teams/mine",
      allowed: { student: 200, otherBatchStudent: 200 },
    },
    {
      method: "GET",
      path: () => `/teams/${bystanderTeam}`,
      allowed: {
        admin: 200,
        facultyOwner: 200,
        otherFaculty: 404,
        student: 404,
        otherBatchStudent: 404,
      },
    },
    {
      method: "PATCH",
      path: () => `/teams/${bystanderTeam}`,
      body: () => ({ name: "Hijacked" }),
      allowed: { student: 404, otherBatchStudent: 404 },
    },
    {
      method: "DELETE",
      path: () => `/teams/${bystanderTeam}`,
      allowed: { student: 404, otherBatchStudent: 404 },
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
        const defaultNotFound = testCase.path().startsWith("/teams/")
          ? "TEAM_NOT_FOUND"
          : testCase.path().startsWith("/course-cycles/")
            ? "CYCLE_NOT_FOUND"
            : undefined;
        const notFound = testCase.notFound ?? defaultNotFound;
        if (expected === 404 && notFound && notFound !== "*") {
          assert.equal(result.body.code, notFound);
        }
        if (expected === 401) {
          assert.equal(result.body.code, "UNAUTHENTICATED");
        }
      });
    }
  }
});
