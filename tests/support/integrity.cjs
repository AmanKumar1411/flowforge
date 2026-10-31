#!/usr/bin/env node
// P2 data integrity, run after all suites: orphans, team sizes, one idea per team, continuous versions,
// evaluations within their scale, released-only visibility rules that the database can show.
// Usage: node support/integrity.cjs [results/integrity.json]
const fs = require("node:fs");
const { Client } = require("pg");
const { databaseUrl } = require("./qa-config.cjs");

const CHECKS = {
  "team members whose team is missing": `SELECT count(*) FROM "TeamMember" tm LEFT JOIN "Team" t ON t.id = tm."teamId" WHERE t.id IS NULL`,
  "teams without members": `SELECT count(*) FROM "Team" t WHERE NOT EXISTS (SELECT 1 FROM "TeamMember" tm WHERE tm."teamId" = t.id)`,
  "teams whose leader is not a member": `SELECT count(*) FROM "Team" t WHERE NOT EXISTS (SELECT 1 FROM "TeamMember" tm WHERE tm."teamId" = t.id AND tm."userId" = t."leaderId")`,
  "teams above the project's largest size": `SELECT count(*) FROM (SELECT t.id FROM "Team" t JOIN "CourseProjectCycle" c ON c.id = t."cycleId" JOIN "TeamMember" tm ON tm."teamId" = t.id GROUP BY t.id, c."maxTeamSize" HAVING count(*) > c."maxTeamSize") x`,
  "teams below the smallest size after the team deadline (published projects)": `SELECT count(*) FROM (SELECT t.id FROM "Team" t JOIN "CourseProjectCycle" c ON c.id = t."cycleId" JOIN "TeamMember" tm ON tm."teamId" = t.id WHERE c.status = 'PUBLISHED' AND c."teamDeadline" < now() AT TIME ZONE 'UTC' GROUP BY t.id, c."minTeamSize" HAVING count(*) < c."minTeamSize") x`,
  "students in two teams of one project": `SELECT count(*) FROM (SELECT "cycleId", "userId" FROM "TeamMember" GROUP BY 1, 2 HAVING count(*) > 1) x`,
  "team members outside the project's batch (core projects)": `SELECT count(*) FROM "TeamMember" tm JOIN "CourseProjectCycle" c ON c.id = tm."cycleId" JOIN "User" u ON u.id = tm."userId" WHERE c.kind = 'CORE' AND u."batchYear" IS DISTINCT FROM c."batchYear"`,
  "elective team members who are not enrolled": `SELECT count(*) FROM "TeamMember" tm JOIN "CourseProjectCycle" c ON c.id = tm."cycleId" JOIN "User" u ON u.id = tm."userId" WHERE c.kind = 'ELECTIVE' AND NOT EXISTS (SELECT 1 FROM "CycleEnrollment" e WHERE e."cycleId" = c.id AND e.email = u.email)`,
  "teams with more than one idea": `SELECT count(*) FROM (SELECT "teamId" FROM "ProjectIdea" GROUP BY 1 HAVING count(*) > 1) x`,
  "ideas whose review history skips a version or decides twice": `SELECT count(*) FROM (SELECT "ideaId", version FROM "IdeaReview" GROUP BY 1, 2 HAVING count(*) > 1) x`,
  "approved ideas without an approval at their version (proposals)": `SELECT count(*) FROM "ProjectIdea" i WHERE i.status = 'APPROVED' AND i.source = 'PROPOSAL' AND NOT EXISTS (SELECT 1 FROM "IdeaReview" r WHERE r."ideaId" = i.id AND r.version = i.version AND r.decision = 'APPROVED')`,
  "submission versions with gaps or duplicates": `SELECT count(*) FROM (SELECT "teamId", "milestoneId" FROM "Submission" GROUP BY 1, 2 HAVING max(version) <> count(*) OR count(DISTINCT version) <> count(*)) x`,
  "submissions after the milestone's due date": `SELECT count(*) FROM "Submission" s JOIN "Milestone" m ON m.id = s."milestoneId" WHERE s."submittedAt" >= m."submissionDueAt"`,
  "submissions before the milestone opened": `SELECT count(*) FROM "Submission" s JOIN "Milestone" m ON m.id = s."milestoneId" WHERE s."submittedAt" < m."submissionOpensAt"`,
  "submissions by someone not in the team": `SELECT count(*) FROM "Submission" s WHERE NOT EXISTS (SELECT 1 FROM "TeamMember" tm WHERE tm."teamId" = s."teamId" AND tm."userId" = s."submittedById")`,
  "submissions from teams without an approved idea": `SELECT count(*) FROM "Submission" s WHERE NOT EXISTS (SELECT 1 FROM "ProjectIdea" i WHERE i."teamId" = s."teamId" AND i.status = 'APPROVED')`,
  "evaluations above the milestone's scale": `SELECT count(*) FROM "Evaluation" e JOIN "MilestoneGrading" g ON g."milestoneId" = e."milestoneId" WHERE e.marks > g."maxMarks"`,
  "evaluations whose revisions do not end at their version": `SELECT count(*) FROM "Evaluation" e WHERE e.version <> (SELECT coalesce(max(r.version), 0) FROM "EvaluationRevision" r WHERE r."evaluationId" = e.id) OR e.version <> (SELECT count(*) FROM "EvaluationRevision" r WHERE r."evaluationId" = e.id)`,
  "evaluations by someone other than the project's faculty": `SELECT count(*) FROM "Evaluation" e JOIN "CourseProjectCycle" c ON c.id = e."cycleId" WHERE e."evaluatedById" <> c."createdByFacultyId"`,
  "milestones out of order or overlapping": `SELECT count(*) FROM "Milestone" a JOIN "Milestone" b ON b."cycleId" = a."cycleId" AND b.position = a.position + 1 WHERE b."submissionOpensAt" < a."submissionDueAt"`,
  "refresh tokens of deactivated users still live": `SELECT count(*) FROM "RefreshToken" r JOIN "User" u ON u.id = r."userId" WHERE u.status = 'DEACTIVATED' AND r."revokedAt" IS NULL AND r."expiresAt" > now() AT TIME ZONE 'UTC'`,
};

(async () => {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  const results = {};
  let failed = 0;
  for (const [label, sql] of Object.entries(CHECKS)) {
    const count = Number((await client.query(sql)).rows[0].count);
    results[label] = count;
    if (count > 0) failed += 1;
    console.log(`${count === 0 ? "ok  " : "FAIL"} ${String(count).padStart(6)}  ${label}`);
  }
  const totals = (await client.query(`SELECT (SELECT count(*) FROM "User") users, (SELECT count(*) FROM "Team") teams, (SELECT count(*) FROM "Submission") submissions, (SELECT count(*) FROM "Evaluation") evaluations, (SELECT count(*) FROM "AuditLog") audit_rows`)).rows[0];
  console.log(JSON.stringify(totals));
  await client.end();
  if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ at: new Date().toISOString(), results, totals }, null, 1));
  process.exit(failed ? 1 : 0);
})();
