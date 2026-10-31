import { expect, test } from "@playwright/test";
import { DAY, Session, cycleBody, fromNow, login, manifest, sql } from "../support/api";

// SEC-IDOR, SEC-ROLE, SEC-MASS: a malicious student (or faculty) swaps ids, calls other roles'
// endpoints and sends fields they should not set. Hidden resources must answer 404.
const m = manifest();
const { capstone, systems, web, design, lastTerm, draftElective } = m.cycles;
const ZERO = "00000000-0000-4000-8000-000000000000";

let student: Session; // leader of capstone team 10
let member: Session; // a non-leader of capstone team 10
let other2024: Session; // leader of systems team 0 (batch 2024)
let alpha: Session; // owns capstone
let bravo: Session; // owns systems
let admin: Session;

test.beforeAll(async () => {
  [student, member, other2024, alpha, bravo, admin] = await Promise.all([
    login(capstone.teams[10].leader),
    login(capstone.teams[10].members[1]),
    login(systems.teams[0].leader),
    login(capstone.owner),
    login(systems.owner),
    login(m.admin, "QA Admin"),
  ]);
});

async function expectStatuses(session: Session, calls: [string, string, unknown?][], allowed: number[], label: string) {
  const failures: string[] = [];
  for (const [method, route, body] of calls) {
    const reply = await session.call(method, route, body);
    if (!allowed.includes(reply.status)) failures.push(`${method} ${route} -> ${reply.status} ${reply.text.slice(0, 120)}`);
    expect(reply.text, `${method} ${route}`).not.toMatch(/Feedback for |"marks":\s*\d/);
  }
  expect(failures, `${label}: expected ${allowed.join("/")}`).toEqual([]);
}

test("SEC-IDOR-1 a student swapping in another team's id gets 404 for every read and write", async () => {
  const otherTeam = capstone.teams[11].id;
  const [m1, m2] = capstone.milestones.map((x) => x.id);
  await expectStatuses(student, [
    ["GET", `/teams/${otherTeam}`],
    ["GET", `/teams/${otherTeam}/idea`],
    ["GET", `/teams/${otherTeam}/milestones/${m1}/submissions`],
    ["POST", `/teams/${otherTeam}/milestones/${m2}/submissions`, { links: [{ type: "GITHUB", url: "https://github.com/x/y" }] }],
    ["GET", `/course-cycles/${capstone.id}/milestones/${m1}/teams/${otherTeam}/evaluations`],
    ["PATCH", `/teams/${otherTeam}`, { name: "Hijacked" }],
    ["DELETE", `/teams/${otherTeam}`],
    ["PUT", `/teams/${otherTeam}/idea`, { title: "x", problem: "x", solution: "x" }],
    ["POST", `/teams/${otherTeam}/idea/pick`, { catalogIdeaId: ZERO }],
  ], [404], "other team");
  const list = await student.call("GET", `/course-cycles/${capstone.id}/teams`);
  expect(list.status).toBe(200);
  const ids = (Array.isArray(list.body) ? list.body : list.body.teams ?? []).map((t: { id: string }) => t.id);
  expect(ids).toEqual([capstone.teams[10].id]);
});

test("SEC-IDOR-2 a student of another batch cannot see or touch the project", async () => {
  const team = capstone.teams[12].id;
  const m1 = capstone.milestones[0].id;
  await expectStatuses(other2024, [
    ["GET", `/course-cycles/${capstone.id}`],
    ["GET", `/course-cycles/${capstone.id}/teams`],
    ["GET", `/course-cycles/${capstone.id}/idea-catalog`],
    ["GET", `/course-cycles/${capstone.id}/team-candidates?q=aa`],
    ["GET", `/course-cycles/${capstone.id}/looking-for-team`],
    ["PUT", `/course-cycles/${capstone.id}/looking-for-team`, { note: "x" }],
    ["POST", `/course-cycles/${capstone.id}/teams`, { name: "Intruders", memberIds: [] }],
    ["GET", `/course-cycles/${capstone.id}/milestones/${m1}/grading`],
    ["GET", `/teams/${team}`],
    ["GET", `/teams/${team}/idea`],
    ["GET", `/course-cycles/${capstone.id}/milestones/${m1}/teams/${team}/evaluations`],
  ], [404], "other batch");
  const visible = await other2024.call("GET", "/course-cycles");
  expect(JSON.stringify(visible.body)).not.toContain(capstone.id);
  const dashboard = await other2024.call("GET", "/me/dashboard");
  expect(JSON.stringify(dashboard.body)).not.toContain(capstone.id);
});

test("SEC-IDOR-3 faculty of another project get 404 for its grading, ideas, teams and settings", async () => {
  const team = capstone.teams[13].id;
  const [m1] = capstone.milestones.map((x) => x.id);
  await expectStatuses(bravo, [
    ["GET", `/course-cycles/${capstone.id}`],
    ["PATCH", `/course-cycles/${capstone.id}`, { description: "x" }],
    ["GET", `/course-cycles/${capstone.id}/publish-checks`],
    ["POST", `/course-cycles/${capstone.id}/close`],
    ["GET", `/course-cycles/${capstone.id}/milestones/${m1}/grading`],
    ["PUT", `/course-cycles/${capstone.id}/milestones/${m1}/grading`, { maxMarks: 10 }],
    ["POST", `/course-cycles/${capstone.id}/milestones/${m1}/grading/release`],
    ["PUT", `/course-cycles/${capstone.id}/milestones/${m1}/teams/${team}/evaluation`, { feedback: "x", expectedVersion: 1 }],
    ["GET", `/course-cycles/${capstone.id}/milestones/${m1}/teams/${team}/evaluations`],
    ["GET", `/course-cycles/${capstone.id}/milestones/${m1}/submissions`],
    ["GET", `/course-cycles/${capstone.id}/ideas`],
    ["POST", `/teams/${team}/idea/review`, { version: 1, decision: "REJECTED", feedback: "x" }],
    ["GET", `/teams/${team}/idea`],
    ["GET", `/teams/${team}`],
    ["GET", `/course-cycles/${capstone.id}/teams`],
    ["GET", `/course-cycles/${web.id}/team-completion`],
    ["POST", `/teams/${web.teams[0].id}/members`, { userId: ZERO }],
    ["GET", `/course-cycles/${design.id}/enrollments`],
    ["POST", `/course-cycles/${design.id}/enrollments`, { emails: [m.students["2025"][900]] }],
    ["GET", `/course-cycles/${capstone.id}/batch-students`],
    ["POST", `/course-cycles/${capstone.id}/idea-catalog`, { title: "x", description: "x" }],
  ], [404], "other faculty");
});

test("SEC-IDOR-4 ids from different projects never combine", async () => {
  const ownTeam = capstone.teams[10].id;
  const foreignMilestone = systems.milestones[1].id;
  await expectStatuses(alpha, [
    ["PUT", `/course-cycles/${capstone.id}/milestones/${systems.milestones[0].id}/teams/${capstone.teams[0].id}/evaluation`, { feedback: "x", expectedVersion: 1 }],
    ["PUT", `/course-cycles/${capstone.id}/milestones/${capstone.milestones[0].id}/teams/${systems.teams[0].id}/evaluation`, { feedback: "x", expectedVersion: 1 }],
    ["GET", `/course-cycles/${capstone.id}/milestones/${systems.milestones[0].id}/grading`],
    ["GET", `/course-cycles/${capstone.id}/milestones/${systems.milestones[0].id}/submissions`],
  ], [404], "faculty mixing ids");
  await expectStatuses(student, [
    ["POST", `/teams/${ownTeam}/milestones/${foreignMilestone}/submissions`, { links: [{ type: "GITHUB", url: "https://github.com/x/y" }] }],
    ["GET", `/teams/${ownTeam}/milestones/${foreignMilestone}/submissions`],
    ["GET", `/course-cycles/${systems.id}/milestones/${systems.milestones[0].id}/teams/${ownTeam}/evaluations`],
    ["GET", `/course-cycles/${capstone.id}/milestones/${systems.milestones[0].id}/teams/${ownTeam}/evaluations`],
  ], [404], "student mixing ids");
});

test("SEC-IDOR-5 malformed and unknown ids answer 400/404, never 500", async () => {
  const bad = ["not-a-uuid", "' OR 1=1--", ZERO, "..%2f..%2fetc%2fpasswd", "1;DROP TABLE \"User\""];
  for (const id of bad) {
    const encoded = encodeURIComponent(id);
    for (const route of [`/course-cycles/${encoded}`, `/teams/${encoded}`, `/teams/${encoded}/idea`, `/course-cycles/${capstone.id}/milestones/${encoded}/grading`]) {
      const reply = await student.call("GET", route);
      expect([400, 404], `${route} -> ${reply.status}`).toContain(reply.status);
    }
  }
});

test("SEC-LEAK-1 no marks or scale reach anyone, on any route, even marks stored earlier; unreleased feedback never reaches students", async () => {
  // Marks are off in this version (H3): the API returns feedback only. Marks saved while they were on stay in
  // the database, so put some there and sweep every route as every role.
  const team = systems.teams[0];
  const m1 = systems.milestones[0].id;
  const capstoneM1 = capstone.milestones[0].id;
  const memberTeam = capstone.teams[10].id;
  await sql(`UPDATE "MilestoneGrading" SET "maxMarks" = 20 WHERE "milestoneId" = ANY($1)`, [[m1, capstoneM1]]);
  await sql(`UPDATE "Evaluation" SET marks = 14 WHERE "milestoneId" = ANY($1) AND "teamId" = ANY($2)`, [[m1, capstoneM1], [team.id, memberTeam]]);
  try {
    const graded = await sql(`SELECT feedback FROM "Evaluation" WHERE "teamId" = $1 AND "milestoneId" = $2`, [team.id, m1]);
    expect(graded).toHaveLength(1);
    const secretFeedback = graded[0].feedback as string;
    const memberSession = await login(team.members[2]);
    const routes: [string, string, unknown?][] = [
      ["GET", "/me/dashboard"],
      ["GET", "/me/upcoming"],
      ["GET", "/teams/mine"],
      ["GET", "/course-cycles/my"],
      ["GET", `/course-cycles/${systems.id}`],
      ["GET", `/course-cycles/${capstone.id}`],
      ["GET", `/teams/${team.id}`],
      ["GET", `/teams/${memberTeam}`],
      ["GET", `/teams/${team.id}/milestones/${m1}/submissions`],
      ["GET", `/course-cycles/${systems.id}/milestones/${m1}/teams/${team.id}/evaluations`],
      ["GET", `/course-cycles/${capstone.id}/milestones/${capstoneM1}/teams/${memberTeam}/evaluations`],
      ["GET", `/course-cycles/${systems.id}/milestones/${m1}/grading`],
      ["GET", `/course-cycles/${capstone.id}/milestones/${capstoneM1}/grading`],
      ["GET", `/course-cycles/${systems.id}/milestones/${m1}/submissions`],
      ["GET", `/course-cycles/${capstone.id}/milestones/${capstoneM1}/submissions`],
      ["PUT", `/course-cycles/${systems.id}/milestones/${m1}/grading`, { maxMarks: 30 }],
      ["PUT", `/course-cycles/${systems.id}/milestones/${m1}/teams/${team.id}/evaluation`, { marks: 1, feedback: "x" }],
    ];
    const leaks: string[] = [];
    let checked = 0;
    for (const [role, session] of [["student", student], ["other 2024 student", other2024], ["systems member", memberSession], ["capstone owner", alpha], ["systems owner", bravo], ["admin", admin]] as const) {
      for (const [method, route, body] of routes) {
        const reply = await session.call(method, route, body);
        checked += 1;
        if (/"(marks|maxMarks)"\s*:/.test(reply.text)) leaks.push(`${role}: ${method} ${route} -> ${reply.text.slice(0, 120)}`);
        if (role !== "systems owner" && role !== "admin" && reply.text.includes(secretFeedback)) leaks.push(`${role} read unreleased feedback: ${method} ${route}`);
      }
    }
    expect(leaks).toEqual([]);
    test.info().annotations.push({ type: "observation", description: `${checked} responses, 6 roles: no marks or scale, no unreleased feedback` });
    // Writing a mark or a scale is refused outright.
    const scale = await bravo.call("PUT", `/course-cycles/${systems.id}/milestones/${m1}/grading`, { maxMarks: 30 });
    expect([scale.status, scale.body?.code]).toEqual([400, "MARKS_DISABLED"]);
    // The released feedback of the student's own project is visible: the filter is per milestone.
    const released = await student.call("GET", `/course-cycles/${capstone.id}/milestones/${capstoneM1}/teams/${memberTeam}/evaluations`);
    expect(released.body[0].feedback).toEqual(expect.any(String));
  } finally {
    await sql(`UPDATE "Evaluation" SET marks = NULL WHERE "milestoneId" = ANY($1)`, [[m1, capstoneM1]]);
    await sql(`UPDATE "MilestoneGrading" SET "maxMarks" = NULL WHERE "milestoneId" = ANY($1)`, [[m1, capstoneM1]]);
  }
});

test("SEC-LEAK-2 a closed project is read-only and visible only to its former members", async () => {
  const former = await login(lastTerm.teams[0].leader);
  const team = lastTerm.teams[0].id;
  expect((await former.call("GET", `/course-cycles/${lastTerm.id}`)).status).toBe(200);
  expect((await former.call("GET", `/course-cycles/${lastTerm.id}/milestones/${lastTerm.milestones[0].id}/teams/${team}/evaluations`)).status).toBe(200);
  for (const [method, route, body] of [
    ["PATCH", `/teams/${team}`, { name: "Renamed after close" }],
    ["DELETE", `/teams/${team}`],
    ["POST", `/teams/${team}/milestones/${lastTerm.milestones[0].id}/submissions`, { links: [{ type: "GITHUB", url: "https://github.com/x/y" }] }],
    ["PUT", `/teams/${team}/idea`, { title: "x", problem: "x", solution: "x" }],
  ] as [string, string, unknown][]) {
    const reply = await former.call(method, route, body);
    expect([403, 404, 409], `${method} ${route} -> ${reply.status}`).toContain(reply.status);
  }
  // A 2023 student who was not in the closed project sees nothing of it.
  const outsider = await login(m.students["2023"][600]);
  expect((await outsider.call("GET", `/course-cycles/${lastTerm.id}`)).status).toBe(404);
  expect(JSON.stringify((await outsider.call("GET", "/me/dashboard")).body)).not.toContain(lastTerm.id);
  expect((await outsider.call("GET", `/teams/${team}`)).status).toBe(404);
});

test("SEC-ROLE-1 students and pending staff are refused faculty and admin endpoints", async () => {
  const m1 = capstone.milestones[0].id;
  const team = capstone.teams[10].id;
  await expectStatuses(student, [
    ["POST", "/course-cycles", cycleBody({}, { teamDeadline: fromNow(DAY), ideaDeadline: fromNow(2 * DAY), milestones: [{ opens: fromNow(2 * DAY), due: fromNow(3 * DAY) }] })],
    ["GET", "/course-cycles/my"],
    ["PATCH", `/course-cycles/${capstone.id}`, { description: "x" }],
    ["POST", `/course-cycles/${capstone.id}/close`],
    ["POST", `/course-cycles/${draftElective.id}/publish`],
    ["PUT", `/course-cycles/${capstone.id}/milestones/${m1}/grading`, { maxMarks: 10 }],
    ["POST", `/course-cycles/${capstone.id}/milestones/${m1}/grading/release`],
    ["PUT", `/course-cycles/${capstone.id}/milestones/${m1}/teams/${team}/evaluation`, { feedback: "x", expectedVersion: 1 }],
    ["POST", `/teams/${team}/idea/review`, { version: 2, decision: "APPROVED" }],
    ["POST", `/teams/${team}/members`, { userId: ZERO }],
    ["GET", `/course-cycles/${capstone.id}/ideas`],
    ["GET", `/course-cycles/${capstone.id}/milestones/${m1}/submissions`],
    ["GET", `/course-cycles/${web.id}/team-completion`],
    ["GET", `/course-cycles/${capstone.id}/enrollments`],
    ["GET", "/admin/users"],
    ["POST", "/admin/faculty-allowlist", { email: "x.y@nst.rishihood.edu.in" }],
    ["PATCH", `/admin/users/${student.userId}/batch`, { batchYear: 2025 }],
  ], [403], "student");
});

test("SEC-ROLE-2 faculty cannot reach admin endpoints and admins cannot grade or publish", async () => {
  await expectStatuses(alpha, [
    ["GET", "/admin/users"],
    ["POST", "/admin/faculty-allowlist", { email: "x.y@nst.rishihood.edu.in" }],
    ["POST", `/admin/users/${student.userId}/deactivate`],
  ], [403], "faculty to admin");
  const m1 = capstone.milestones[0].id;
  await expectStatuses(admin, [
    ["PUT", `/course-cycles/${capstone.id}/milestones/${m1}/teams/${capstone.teams[0].id}/evaluation`, { feedback: "x", expectedVersion: 1 }],
    ["POST", `/course-cycles/${capstone.id}/milestones/${m1}/grading/release`],
    ["POST", `/course-cycles/${capstone.id}/close`],
  ], [403], "admin writes");
});

test("SEC-MASS-1 fields a client must not set are refused (forbidNonWhitelisted)", async () => {
  const plan = { teamDeadline: fromNow(DAY), ideaDeadline: fromNow(2 * DAY), milestones: [{ opens: fromNow(2 * DAY), due: fromNow(3 * DAY) }] };
  const team = capstone.teams[10].id;
  const m2 = capstone.milestones[1].id;
  const cases: [Session, string, string, Record<string, unknown>][] = [
    [alpha, "POST", "/course-cycles", { ...cycleBody({}, plan), status: "PUBLISHED" }],
    [alpha, "POST", "/course-cycles", { ...cycleBody({}, plan), createdByFacultyId: bravo.userId }],
    [alpha, "POST", "/course-cycles", { ...cycleBody({}, plan), publishedAt: new Date().toISOString() }],
    [alpha, "PATCH", `/course-cycles/${draftElective.id}`, { status: "PUBLISHED" }],
    [student, "PATCH", `/teams/${team}`, { leaderId: member.userId }],
    [student, "PATCH", `/teams/${team}`, { cycleId: systems.id }],
    [student, "PUT", `/teams/${team}/idea`, { title: "x", problem: "x", solution: "x", status: "APPROVED" }],
    [student, "PUT", `/teams/${team}/idea`, { title: "x", problem: "x", solution: "x", version: 99 }],
    [member, "POST", `/teams/${team}/milestones/${m2}/submissions`, { links: [{ type: "GITHUB", url: "https://github.com/a/b" }], version: 99 }],
    [member, "POST", `/teams/${team}/milestones/${m2}/submissions`, { links: [{ type: "GITHUB", url: "https://github.com/a/b" }], submittedById: student.userId }],
    [alpha, "PUT", `/course-cycles/${capstone.id}/milestones/${capstone.milestones[0].id}/teams/${team}/evaluation`, { marks: 50, evaluatedById: bravo.userId, expectedVersion: 1 }],
    [alpha, "PUT", `/course-cycles/${capstone.id}/milestones/${capstone.milestones[0].id}/grading`, { maxMarks: 100, releasedAt: null }],
    [admin, "PATCH", `/admin/users/${student.userId}/batch`, { batchYear: 2024, role: "ADMIN" }],
  ];
  for (const [session, method, route, body] of cases) {
    const reply = await session.call(method, route, body);
    expect(reply.status, `${method} ${route} ${Object.keys(body).at(-1)}`).toBe(400);
  }
  const role = await sql(`SELECT role, "batchYear" FROM "User" WHERE id = $1`, [student.userId]);
  expect(role[0]).toEqual({ role: "STUDENT", batchYear: 2023 });
  // A published project's fixed fields stay fixed.
  const locked = await alpha.call("PATCH", `/course-cycles/${capstone.id}`, { batchYear: 2025 });
  expect([400, 409]).toContain(locked.status);
});

test("SEC-ROLE-3 a member (not leader) cannot do leader actions through the API", async () => {
  const team = capstone.teams[10].id;
  const calls: [string, string, unknown?][] = [
    ["PATCH", `/teams/${team}`, { name: "Member rename" }],
    ["DELETE", `/teams/${team}`],
    ["PUT", `/teams/${team}/idea`, { title: "x", problem: "x", solution: "x" }],
  ];
  for (const [method, route, body] of calls) {
    const reply = await member.call(method, route, body);
    expect([403, 409], `${method} ${route} -> ${reply.status} ${reply.body?.code}`).toContain(reply.status);
  }
});
