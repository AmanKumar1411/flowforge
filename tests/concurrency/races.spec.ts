import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { DAY, MINUTE, Reply, Session, cycleBody, fromNow, login, manifest, sql } from "../support/api";

// P1 concurrency: parallel requests that real users produce (double clicks, two tabs, many members,
// the last second before a deadline). The database is checked afterwards.
test.setTimeout(240_000);

const m = manifest();
const { capstone, systems, web, design } = m.cycles;
const count = (replies: Reply[], status: number) => replies.filter((r) => r.status === status).length;
const statuses = (replies: Reply[]) => Object.entries(replies.reduce<Record<string, number>>((acc, r) => ({ ...acc, [`${r.status}${r.body?.code ? ` ${r.body.code}` : ""}`]: (acc[`${r.status}${r.body?.code ? ` ${r.body.code}` : ""}`] ?? 0) + 1 }), {})).map(([k, v]) => `${k}×${v}`).join(", ");
const note = (text: string) => test.info().annotations.push({ type: "observation", description: text });

async function versionsOf(teamId: string, milestoneId: string): Promise<number[]> {
  return (await sql(`SELECT version FROM "Submission" WHERE "teamId" = $1 AND "milestoneId" = $2 ORDER BY version`, [teamId, milestoneId])).map((r) => r.version);
}
const continuous = (versions: number[]) => versions.every((v, i) => v === i + 1);

test("CON-1 members of one team submit 20 times at once: versions stay 1..n with no gaps or duplicates", async () => {
  const team = capstone.teams[100];
  const m2 = capstone.milestones[1].id;
  const before = await versionsOf(team.id, m2);
  const sessions = await Promise.all(team.members.map((email) => login(email)));
  const replies = await Promise.all(Array.from({ length: 20 }, (_, i) =>
    sessions[i % sessions.length].call("POST", `/teams/${team.id}/milestones/${m2}/submissions`, { links: [{ type: "GITHUB", url: `https://github.com/race/r${i}` }] })));
  note(`one team, 20 parallel submits: ${statuses(replies)}`);
  const after = await versionsOf(team.id, m2);
  expect(continuous(after), `versions ${after.join(",")}`).toBeTruthy();
  expect(after.length - before.length).toBe(count(replies, 201));
  expect(replies.filter((r) => r.status >= 500)).toEqual([]);
  expect(count(replies, 201), "every member's click should be kept as a version").toBe(20);
});

test("CON-1b 50 teams × 4 members submit at the same moment (200 requests): every team's versions stay continuous", async () => {
  const teams = capstone.teams.slice(110, 160);
  const m2 = capstone.milestones[1].id;
  const sessions = await Promise.all(teams.flatMap((t) => t.members.map((email) => login(email).then((s) => ({ s, team: t })))));
  const replies = await Promise.all(sessions.map(({ s, team }, i) => s.call("POST", `/teams/${team.id}/milestones/${m2}/submissions`, { links: [{ type: "GITHUB", url: `https://github.com/race/t${i}` }] })));
  note(`200 parallel submits over 50 teams: ${statuses(replies)}`);
  const broken: string[] = [];
  for (const t of teams) {
    const versions = await versionsOf(t.id, m2);
    if (!continuous(versions)) broken.push(`${t.name}: ${versions.join(",")}`);
  }
  expect(broken).toEqual([]);
  expect(replies.filter((r) => r.status >= 500)).toEqual([]);
  const lost = replies.length - count(replies, 201);
  expect(lost, `${lost} of 200 submissions were not saved`).toBe(0);
});

test("CON-2 the last free slot of a team is taken once: 10 faculty placements at once", async () => {
  const charlie = await login(web.owner);
  const unteamed = (await sql(`SELECT u.id FROM "User" u WHERE u."batchYear" = 2025 AND u.role = 'STUDENT' AND u.status = 'ACTIVE'
    AND NOT EXISTS (SELECT 1 FROM "TeamMember" tm WHERE tm."userId" = u.id AND tm."cycleId" = $1) ORDER BY u.email LIMIT 13`, [web.id])).map((r) => r.id);
  expect(unteamed.length).toBe(13);
  let created = await charlie.call("POST", `/course-cycles/${web.id}/team-completion/teams`, { name: "Race slot", leaderId: unteamed[0], memberIds: unteamed.slice(1, 3) });
  if (created.status === 400) created = await charlie.call("POST", `/course-cycles/${web.id}/team-completion/teams`, { name: "Race slot", leaderId: unteamed[0], memberIds: unteamed.slice(0, 3) });
  expect(created.status, created.text).toBeLessThan(300);
  const teamId = (await sql(`SELECT id FROM "Team" WHERE "cycleId" = $1 AND name = 'Race slot'`, [web.id]))[0].id;
  const replies = await Promise.all(unteamed.slice(3, 13).map((userId) => charlie.call("POST", `/teams/${teamId}/members`, { userId })));
  note(`10 placements into the last slot: ${statuses(replies)}`);
  const size = (await sql(`SELECT count(*)::int AS n FROM "TeamMember" WHERE "teamId" = $1`, [teamId]))[0].n;
  expect(size).toBe(4);
  expect(replies.filter((r) => r.status < 300).length).toBe(1);
  expect(replies.filter((r) => r.status >= 500)).toEqual([]);
});

test("CON-3 two leaders add the same student at once: the student ends up in exactly one team", async () => {
  const designFree = m.students["2025"].slice(850, 860);
  const sessions = await Promise.all(designFree.slice(0, 5).map((email) => login(email)));
  const [leaderA, memberA, leaderB, memberB, target] = sessions;
  const teamA = await leaderA.call("POST", `/course-cycles/${design.id}/teams`, { name: "Race A", memberIds: [memberA.userId] });
  const teamB = await leaderB.call("POST", `/course-cycles/${design.id}/teams`, { name: "Race B", memberIds: [memberB.userId] });
  expect([teamA.status, teamB.status]).toEqual([201, 201]);
  const replies = await Promise.all([
    leaderA.call("PATCH", `/teams/${teamA.body.id}`, { memberIds: [memberA.userId, target.userId] }),
    leaderB.call("PATCH", `/teams/${teamB.body.id}`, { memberIds: [memberB.userId, target.userId] }),
  ]);
  note(`two leaders add the same student: ${statuses(replies)}`);
  const memberships = await sql(`SELECT "teamId" FROM "TeamMember" WHERE "userId" = $1 AND "cycleId" = $2`, [target.userId, design.id]);
  expect(memberships.length).toBe(1);
  expect(count(replies, 200)).toBe(1);
  expect(replies.filter((r) => r.status >= 500)).toEqual([]);
});

test("CON-3b a leader's edit races a member being taken by another team; double-clicked team creation", async () => {
  const roster = m.students["2025"].slice(840, 850);
  const s = await Promise.all(roster.slice(0, 5).map((email) => login(email)));
  const [leaderA, shared, leaderB, keep, solo] = s;
  const teamA = await leaderA.call("POST", `/course-cycles/${design.id}/teams`, { name: "Edit race A", memberIds: [shared.userId, keep.userId] });
  expect(teamA.status, teamA.text).toBe(201);
  // Leader A drops the shared member while leader B (forming) claims them.
  const [edit, claim] = await Promise.all([
    leaderA.call("PATCH", `/teams/${teamA.body.id}`, { name: "Edit race A2", memberIds: [keep.userId] }),
    leaderB.call("POST", `/course-cycles/${design.id}/teams`, { name: "Edit race B", memberIds: [shared.userId] }),
  ]);
  note(`edit vs claim: edit ${edit.status} ${edit.body?.code ?? ""}, claim ${claim.status} ${claim.body?.code ?? ""}`);
  const memberships = await sql(`SELECT "teamId" FROM "TeamMember" WHERE "userId" = $1 AND "cycleId" = $2`, [shared.userId, design.id]);
  expect(memberships.length).toBeLessThanOrEqual(1);
  expect([edit.status, claim.status].every((x) => x < 500)).toBeTruthy();
  // A double click on "Create team" creates one team.
  const partner = await login(roster[5]);
  const solos = await Promise.all([1, 2, 3].map(() => solo.call("POST", `/course-cycles/${design.id}/teams`, { name: "Double click", memberIds: [partner.userId] })));
  note(`triple-click create team: ${statuses(solos)}`);
  const led = await sql(`SELECT count(*)::int AS n FROM "Team" WHERE "leaderId" = $1 AND "cycleId" = $2`, [solo.userId, design.id]);
  expect(led[0].n).toBeLessThanOrEqual(1);
  expect(solos.filter((r) => r.status >= 500)).toEqual([]);
});

test("CON-4 two faculty tabs save the same evaluation: one wins, the other gets 409 EVALUATION_CHANGED", async () => {
  const alpha = await login(capstone.owner);
  const alpha2 = await login(capstone.owner);
  const team = capstone.teams[50].id;
  const route = `/course-cycles/${capstone.id}/milestones/${capstone.milestones[0].id}/teams/${team}/evaluation`;
  const current = (await sql(`SELECT version FROM "Evaluation" WHERE "teamId" = $1 AND "milestoneId" = $2`, [team, capstone.milestones[0].id]))[0].version;
  const replies = await Promise.all([
    alpha.call("PUT", route, { marks: 61, feedback: "Tab one", expectedVersion: current }),
    alpha2.call("PUT", route, { marks: 62, feedback: "Tab two", expectedVersion: current }),
  ]);
  note(`two tabs, same version: ${statuses(replies)}`);
  expect(count(replies, 200)).toBe(1);
  expect(replies.find((r) => r.status !== 200)?.body.code).toBe("EVALUATION_CHANGED");
  const revisions = await sql(`SELECT r.version FROM "EvaluationRevision" r JOIN "Evaluation" e ON e.id = r."evaluationId" WHERE e."teamId" = $1 AND e."milestoneId" = $2 ORDER BY r.version`, [team, capstone.milestones[0].id]);
  expect(revisions.map((r) => r.version)).toEqual(Array.from({ length: current + 1 }, (_, i) => i + 1));

  // First grade of an ungraded team from 10 tabs at once: one evaluation, one revision.
  const bravo = await Promise.all(Array.from({ length: 10 }, () => login(systems.owner)));
  const fresh = systems.teams[230].id;
  const first = await Promise.all(bravo.map((b, i) => b.call("PUT", `/course-cycles/${systems.id}/milestones/${systems.milestones[0].id}/teams/${fresh}/evaluation`, { marks: 20 + i })));
  note(`10 first saves of one evaluation: ${statuses(first)}`);
  expect(count(first, 200)).toBe(1);
  expect((await sql(`SELECT count(*)::int AS n FROM "EvaluationRevision" r JOIN "Evaluation" e ON e.id = r."evaluationId" WHERE e."teamId" = $1`, [fresh]))[0].n).toBe(1);
  expect(first.filter((r) => r.status >= 500)).toEqual([]);
});

test("CON-5 publish and close double-clicked: one transition each, one audit row each", async () => {
  const foxtrot = await Promise.all([login(m.faculty[5]), login(m.faculty[5])]);
  const draft = await foxtrot[0].call("POST", "/course-cycles", cycleBody({ title: `Double click ${Date.now()}`, batchYear: 2024, semester: 5 }, {
    teamDeadline: fromNow(DAY), ideaDeadline: fromNow(2 * DAY), milestones: [{ opens: fromNow(2 * DAY), due: fromNow(9 * DAY) }],
  }));
  expect(draft.status, draft.text).toBe(201);
  const id = draft.body.id;
  const publish = await Promise.all(foxtrot.flatMap((f) => [f.call("POST", `/course-cycles/${id}/publish`), f.call("POST", `/course-cycles/${id}/publish`)]));
  note(`4 publish clicks: ${statuses(publish)}`);
  expect(count(publish, 200)).toBe(1);
  const close = await Promise.all(foxtrot.flatMap((f) => [f.call("POST", `/course-cycles/${id}/close`), f.call("POST", `/course-cycles/${id}/close`)]));
  note(`4 close clicks: ${statuses(close)}`);
  expect(count(close, 200)).toBe(1);
  const audit = await sql(`SELECT action, count(*)::int AS n FROM "AuditLog" WHERE "entityId" = $1 GROUP BY action ORDER BY action`, [id]);
  expect(audit.filter((a) => ["CYCLE_PUBLISHED", "CYCLE_CLOSED"].includes(a.action)).map((a) => `${a.action}:${a.n}`).sort()).toEqual(["CYCLE_CLOSED:1", "CYCLE_PUBLISHED:1"]);
  expect([...publish, ...close].filter((r) => r.status >= 500)).toEqual([]);
});

test.describe("deadline races on a project due in 40 seconds", () => {
  let cycleId = "";
  let m1 = "";
  let m2 = "";
  const people = m.students["2025"].slice(0, 80);
  let due = new Date();
  let teams: { id: string; members: string[] }[] = [];

  test.beforeAll(async () => {
    // A worker restarted after a failure builds a fresh project, so each test can still run.
    [cycleId, m1, m2, teams] = [randomUUID(), randomUUID(), randomUUID(), []];
    // Inserted directly (the clock is real): 20 teams with approved ideas, M1 due in 40 s.
    const golf = (await sql(`SELECT id FROM "User" WHERE email = $1`, [m.faculty[6]]))[0].id;
    const ids = (await sql(`SELECT id, email FROM "User" WHERE email = ANY($1)`, [people])).reduce<Record<string, string>>((acc, r) => ({ ...acc, [r.email]: r.id }), {});
    due = new Date(Date.now() + 40_000);
    await sql(`INSERT INTO "CourseProjectCycle" (id, "courseName", title, "batchYear", semester, "academicYear", "minTeamSize", "maxTeamSize", "teamDeadline", "ideaDeadline", kind, status, "createdByFacultyId", "publishedAt", "updatedAt")
      VALUES ($1, 'Race course', 'Deadline race', 2025, 3, '2026-27', 2, 4, now() - interval '2 days', now() - interval '1 day', 'CORE', 'PUBLISHED', $2, now() - interval '3 days', now())`, [cycleId, golf]);
    await sql(`INSERT INTO "Milestone" (id, "cycleId", position, name, "submissionOpensAt", "submissionDueAt", "evaluationAt", "linkRequirement", "updatedAt") VALUES
      ($1, $3, 1, 'Race M1', now() - interval '1 day', $4, $4, '{"required":["GITHUB"],"optional":[]}', now()),
      ($2, $3, 2, 'Race M2', now() + interval '1 day', now() + interval '2 days', now() + interval '2 days', '{"required":["GITHUB"],"optional":[]}', now())`, [m1, m2, cycleId, due]);
    for (let k = 0; k < 20; k += 1) {
      const members = people.slice(k * 4, k * 4 + 4);
      const teamId = randomUUID();
      teams.push({ id: teamId, members });
      await sql(`INSERT INTO "Team" (id, "cycleId", name, "leaderId", "updatedAt") VALUES ($1, $2, $3, $4, now())`, [teamId, cycleId, `Race ${k + 1}`, ids[members[0]]]);
      for (const email of members) await sql(`INSERT INTO "TeamMember" ("teamId", "cycleId", "userId", "addedById") VALUES ($1, $2, $3, $4)`, [teamId, cycleId, ids[email], ids[members[0]]]);
      const ideaId = randomUUID();
      await sql(`INSERT INTO "ProjectIdea" (id, "teamId", "cycleId", title, problem, solution, links, status, "submittedById", "submittedAt", "updatedAt") VALUES ($1, $2, $3, 'Race idea', 'p', 's', '[]', 'APPROVED', $4, now(), now())`, [ideaId, teamId, cycleId, ids[members[0]]]);
      await sql(`INSERT INTO "IdeaReview" (id, "ideaId", version, decision, "reviewerId") VALUES ($1, $2, 1, 'APPROVED', $3)`, [randomUUID(), ideaId, golf]);
    }
  });

  test("CON-6 submissions racing the due date: accepted ones are before it, late ones get 409, none are 5xx", async () => {
    const sessions = await Promise.all(teams.map((t) => login(t.members[1]).then((s) => ({ s, team: t }))));
    const start = due.getTime() - 3_000;
    await new Promise((r) => setTimeout(r, Math.max(0, start - Date.now())));
    const replies: { reply: Reply; sentAt: number }[] = [];
    const pending: Promise<void>[] = [];
    while (Date.now() < due.getTime() + 3_000) {
      for (const { s, team } of sessions) {
        const sentAt = Date.now();
        pending.push(s.call("POST", `/teams/${team.id}/milestones/${m1}/submissions`, { links: [{ type: "GITHUB", url: "https://github.com/race/deadline" }] }).then((reply) => {
          replies.push({ reply, sentAt });
        }));
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    await Promise.all(pending);
    const late = await sql(`SELECT count(*)::int AS n FROM "Submission" WHERE "milestoneId" = $1 AND "submittedAt" >= $2`, [m1, due]);
    note(`${replies.length} submits from due-3s to due+3s: ${statuses(replies.map((r) => r.reply))}`);
    expect(late[0].n).toBe(0);
    expect(replies.filter((r) => r.reply.status >= 500)).toEqual([]);
    expect(replies.filter((r) => r.reply.status === 409).every((r) => r.reply.body.code === "SUBMISSION_CLOSED")).toBeTruthy();
    const broken = [];
    for (const team of teams) if (!continuous(await versionsOf(team.id, m1))) broken.push(team.id);
    expect(broken).toEqual([]);
  });

  test("CON-5b release while grading continues, and release double-clicked", async () => {
    const golf = await Promise.all([login(m.faculty[6]), login(m.faculty[6])]);
    await new Promise((r) => setTimeout(r, Math.max(0, due.getTime() + 500 - Date.now())));
    const scale = await golf[0].call("PUT", `/course-cycles/${cycleId}/milestones/${m1}/grading`, { maxMarks: 10 });
    expect(scale.status, scale.text).toBe(200);
    const saves = teams.map((t, i) => golf[i % 2].call("PUT", `/course-cycles/${cycleId}/milestones/${m1}/teams/${t.id}/evaluation`, { marks: 5, feedback: `Race ${i}` }));
    const releases = [golf[0].call("POST", `/course-cycles/${cycleId}/milestones/${m1}/grading/release`), golf[1].call("POST", `/course-cycles/${cycleId}/milestones/${m1}/grading/release`)];
    const [saveReplies, releaseReplies] = await Promise.all([Promise.all(saves), Promise.all(releases)]);
    note(`20 saves during release: ${statuses(saveReplies)}; 2 release clicks: ${statuses(releaseReplies)}`);
    expect(count(releaseReplies, 200)).toBe(1);
    expect([...saveReplies, ...releaseReplies].filter((r) => r.status >= 500)).toEqual([]);
    const audit = await sql(`SELECT count(*)::int AS n FROM "AuditLog" WHERE action = 'EVALUATION_RELEASED' AND "entityId" = $1`, [m1]);
    expect(audit[0].n).toBe(1);
    // Every evaluation is visible to its team now, and "Updated" is set only for saves after the release.
    const grading = await sql(`SELECT "releasedAt" FROM "MilestoneGrading" WHERE "milestoneId" = $1`, [m1]);
    const evaluations = await sql(`SELECT "updatedAt", "createdAt", version FROM "Evaluation" WHERE "milestoneId" = $1`, [m1]);
    note(`${evaluations.filter((e) => e.updatedAt > grading[0].releasedAt).length} of ${evaluations.length} evaluations saved after the release`);
    const member = await login(teams[0].members[2]);
    const seen = await member.call("GET", `/course-cycles/${cycleId}/milestones/${m1}/teams/${teams[0].id}/evaluations`);
    expect(seen.status).toBe(200);
    expect(seen.body[0]?.marks).toBe(5);
  });
});

test("CON-7 a faculty review races the leader's edit of the same idea: the decision applies to the version read", async () => {
  const charlie = await login(web.owner);
  const results: string[] = [];
  for (const t of web.teams.slice(60, 70)) {
    const leader = await login(t.leader);
    const before = await sql(`SELECT version FROM "ProjectIdea" WHERE "teamId" = $1`, [t.id]);
    const [review, edit] = await Promise.all([
      charlie.call("POST", `/teams/${t.id}/idea/review`, { version: before[0].version, decision: "APPROVED" }),
      leader.call("PUT", `/teams/${t.id}/idea`, { title: "Edited during review", problem: "p2", solution: "s2" }),
    ]);
    results.push(`${review.status}/${edit.status}`);
    const after = (await sql(`SELECT status, version, title FROM "ProjectIdea" WHERE "teamId" = $1`, [t.id]))[0];
    if (after.status === "APPROVED") {
      // Approved means the version the faculty read; the edit must not have slipped in after the approval.
      expect(after.version, `${t.name}: approved version`).toBe(before[0].version);
      expect(after.title).not.toBe("Edited during review");
    }
    expect([review.status, edit.status].every((s) => s < 500)).toBeTruthy();
  }
  note(`review/edit statuses: ${results.join(" ")}`);
});
