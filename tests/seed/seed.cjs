#!/usr/bin/env node
// Seeds the isolated QA database (flowforge_qa on port 5433) with a production-sized dataset:
// 3 batches x 1,000 students, 20 faculty, 1 admin, projects in every stage, 780 teams, ideas,
// submissions and evaluations in every state. Writes tests/.qa/manifest.json for the suites.
//
// It refuses any other database: it TRUNCATEs every application table.
// Run: node tests/seed/seed.cjs   (reads QA_DB_PASSWORD from tests/.qa/qa.env)
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");
const { databaseUrl, QA_DIR } = require("../support/qa-config.cjs");

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const NOW = new Date();
const at = (offset) => new Date(NOW.getTime() + offset);
const DOMAIN = "nst.rishihood.edu.in";

const FIRST = [
  "aarav", "vivaan", "aditya", "vihaan", "arjun", "sai", "reyansh", "ayaan", "krishna", "ishaan",
  "shaurya", "atharv", "advik", "pranav", "advait", "dhruv", "kabir", "ritvik", "aarush", "kayaan",
  "ananya", "diya", "aadhya", "saanvi", "pari", "anika", "navya", "angel", "myra", "sara",
  "ira", "aarohi", "riya", "anvi", "prisha", "kiara", "meera", "tara", "zoya", "nisha",
];
const LAST = [
  "sharma", "verma", "gupta", "singh", "kumar", "patel", "reddy", "nair", "iyer", "menon",
  "joshi", "mehta", "shah", "das", "bose", "rao", "pillai", "chopra", "kapoor", "malhotra",
  "saxena", "bhat", "kulkarni", "desai", "jain",
];
const NATO = [
  "alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliett",
  "kilo", "lima", "mike", "november", "oscar", "papa", "quebec", "romeo", "sierra", "tango",
];
const cap = (word) => word[0].toUpperCase() + word.slice(1);
const BATCHES = [2023, 2024, 2025];

async function insert(client, table, columns, rows) {
  const per = Math.floor(60000 / columns.length);
  for (let start = 0; start < rows.length; start += per) {
    const chunk = rows.slice(start, start + per);
    const values = [];
    const tuples = chunk.map((row) => {
      const marks = columns.map((column) => {
        // Prisma's DateTime columns are timestamp without time zone holding UTC; pg would send local time.
        const value = row[column] === undefined ? null : row[column];
        values.push(value instanceof Date ? value.toISOString() : value);
        return `$${values.length}`;
      });
      return `(${marks.join(",")})`;
    });
    await client.query(
      `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(",")}) VALUES ${tuples.join(",")}`,
      values,
    );
  }
}

function main() {
  const users = [];
  const allowlist = [];
  const cycles = [];
  const milestones = [];
  const enrollments = [];
  const teams = [];
  const members = [];
  const seekers = [];
  const catalog = [];
  const ideas = [];
  const reviews = [];
  const submissions = [];
  const gradings = [];
  const evaluations = [];
  const revisions = [];

  const user = (email, name, role, batchYear, extra = {}) => {
    const row = {
      id: randomUUID(),
      googleSub: `dev|${email}`,
      email,
      name,
      role,
      status: "ACTIVE",
      batchYear,
      tokenVersion: 0,
      createdAt: at(-200 * DAY),
      updatedAt: at(-200 * DAY),
      ...extra,
    };
    users.push(row);
    return row;
  };

  const admin = user(`qa.admin@${DOMAIN}`, "QA Admin", "ADMIN", null);
  const faculty = NATO.map((word) => {
    const row = user(`fac.${word}@${DOMAIN}`, `Prof ${cap(word)}`, "FACULTY", null);
    allowlist.push({ id: randomUUID(), email: row.email, name: row.name, source: "MANUAL", addedById: admin.id });
    return row;
  });
  const pendingStaff = user(`staff.pending@${DOMAIN}`, "Pending Staff", "PENDING_STAFF", null);
  const students = {};
  for (const year of BATCHES) {
    const yy = String(year).slice(2);
    students[year] = [];
    for (let i = 0; i < 1000; i += 1) {
      const first = FIRST[i % FIRST.length];
      const last = LAST[Math.floor(i / FIRST.length)];
      students[year].push(user(`${first}.${last}${yy}@${DOMAIN}`, `${cap(first)} ${cap(last)}`, "STUDENT", year));
    }
  }
  const deactivated = students[2025][999];
  deactivated.status = "DEACTIVATED";

  const cycle = (fields, plan) => {
    const row = {
      id: randomUUID(),
      description: "Seeded by the QA suite.",
      minTeamSize: 2,
      maxTeamSize: 4,
      ideaSource: "BOTH",
      ideaLinkRequirement: JSON.stringify({ required: [], optional: ["GITHUB", "DRIVE"] }),
      kind: "CORE",
      status: "PUBLISHED",
      publishedAt: at(-50 * DAY),
      closedAt: null,
      createdAt: at(-60 * DAY),
      updatedAt: at(-50 * DAY),
      ...fields,
    };
    cycles.push(row);
    row.milestones = plan.map(([opens, due, evaluation], index) => {
      const milestone = {
        id: randomUUID(),
        cycleId: row.id,
        position: index + 1,
        name: ["Proposal and design", "Working prototype", "Final delivery"][index] ?? `Milestone ${index + 1}`,
        description: `M${index + 1} of ${row.title}`,
        submissionOpensAt: at(opens),
        submissionDueAt: at(due),
        evaluationAt: at(evaluation),
        linkRequirement: JSON.stringify({ required: ["GITHUB"], optional: ["DEMO", "REPORT"] }),
        createdAt: row.createdAt,
        updatedAt: row.createdAt,
      };
      milestones.push(milestone);
      return milestone;
    });
    row.teams = [];
    return row;
  };

  const team = (owner, name, people, origin = "STUDENT") => {
    const row = {
      id: randomUUID(),
      cycleId: owner.id,
      name,
      leaderId: people[0].id,
      origin,
      createdAt: at(-45 * DAY),
      updatedAt: at(-45 * DAY),
      people,
    };
    teams.push(row);
    owner.teams.push(row);
    for (const person of people) {
      members.push({ teamId: row.id, cycleId: owner.id, userId: person.id, addedById: people[0].id, addedAt: row.createdAt });
    }
    return row;
  };

  const idea = (owner, t, status, { version = 1, catalogIdea = null, rejectedFirst = false } = {}) => {
    const row = {
      id: randomUUID(),
      teamId: t.id,
      cycleId: owner.id,
      title: catalogIdea ? catalogIdea.title : `${t.name}: campus helper`,
      problem: "Students lose track of deadlines and shared files.",
      solution: "A small web app with reminders.",
      links: JSON.stringify([{ type: "GITHUB", url: `https://github.com/qa-org/${t.id.slice(0, 8)}` }]),
      status,
      source: catalogIdea ? "CATALOG" : "PROPOSAL",
      catalogIdeaId: catalogIdea?.id ?? null,
      version,
      submittedById: t.leaderId,
      submittedAt: at(-35 * DAY),
      createdAt: at(-36 * DAY),
      updatedAt: at(-34 * DAY),
    };
    ideas.push(row);
    const reviewer = owner.createdByFacultyId;
    if (rejectedFirst) {
      reviews.push({ id: randomUUID(), ideaId: row.id, version: 1, decision: "REJECTED", feedback: "Narrow the scope to one user group.", reviewerId: reviewer, createdAt: at(-35 * DAY) });
    }
    if (status === "APPROVED" && !catalogIdea) {
      reviews.push({ id: randomUUID(), ideaId: row.id, version, decision: "APPROVED", feedback: null, reviewerId: reviewer, createdAt: at(-34 * DAY) });
    }
    if (status === "REJECTED") {
      reviews.push({ id: randomUUID(), ideaId: row.id, version, decision: "REJECTED", feedback: "The problem is too broad; pick one course.", reviewerId: reviewer, createdAt: at(-1 * DAY) });
    }
    return row;
  };

  const submit = (owner, t, milestone, version, when, byIndex = 0) => {
    submissions.push({
      id: randomUUID(),
      teamId: t.id,
      cycleId: owner.id,
      milestoneId: milestone.id,
      version,
      links: JSON.stringify([
        { type: "GITHUB", url: `https://github.com/qa-org/${t.id.slice(0, 8)}` },
        ...(version > 1 ? [{ type: "DEMO", url: `https://demo-${t.id.slice(0, 8)}.example.org` }] : []),
      ]),
      notes: version > 1 ? `Version ${version}: fixed review comments` : null,
      submittedById: t.people[byIndex % t.people.length].id,
      submittedAt: when,
    });
  };

  const grade = (owner, milestone, maxMarks, releasedAt, teamsToGrade, marksOf, updatedAfterRelease) => {
    gradings.push({ milestoneId: milestone.id, maxMarks, releasedAt, releasedById: releasedAt ? owner.createdByFacultyId : null, updatedAt: releasedAt ?? milestone.submissionDueAt });
    teamsToGrade.forEach((t, k) => {
      const created = new Date(milestone.submissionDueAt.getTime() + 6 * HOUR);
      const evaluation = {
        id: randomUUID(),
        milestoneId: milestone.id,
        teamId: t.id,
        cycleId: owner.id,
        marks: String(marksOf(k)),
        feedback: `Feedback for ${t.name}: clear structure, add tests.`,
        version: 1,
        evaluatedById: owner.createdByFacultyId,
        createdAt: created,
        updatedAt: created,
      };
      revisions.push({ id: randomUUID(), evaluationId: evaluation.id, version: 1, marks: evaluation.marks, feedback: evaluation.feedback, evaluatedById: evaluation.evaluatedById, createdAt: created });
      if (updatedAfterRelease(k)) {
        evaluation.version = 2;
        evaluation.marks = String(Math.min(maxMarks, marksOf(k) + 5));
        evaluation.feedback += " Re-marked after review.";
        evaluation.updatedAt = at(-2 * DAY);
        revisions.push({ id: randomUUID(), evaluationId: evaluation.id, version: 2, marks: evaluation.marks, feedback: evaluation.feedback, evaluatedById: evaluation.evaluatedById, createdAt: evaluation.updatedAt });
      }
      evaluations.push(evaluation);
    });
  };

  const fac = (word) => faculty[NATO.indexOf(word)];
  const groups = (people, size, count) => Array.from({ length: count }, (_, k) => people.slice(k * size, k * size + size));

  // A: batch 2023, M1 graded and released (some updated after release), M2 open (due in 2 days), M3 upcoming.
  const capstone = cycle(
    { courseName: "Software Engineering", title: "Capstone project", batchYear: 2023, semester: 7, academicYear: "2026-27", createdByFacultyId: fac("alpha").id, teamDeadline: at(-40 * DAY), ideaDeadline: at(-30 * DAY), publishedAt: at(-45 * DAY) },
    [[-30 * DAY, -10 * DAY, -9 * DAY], [-9 * DAY, 2 * DAY, 3 * DAY], [3 * DAY, 10 * DAY, 11 * DAY]],
  );
  groups(students[2023], 4, 250).forEach((people, k) => {
    const t = team(capstone, `Capstone ${String(k + 1).padStart(3, "0")}`, people);
    idea(capstone, t, "APPROVED", k % 5 === 0 ? { version: 2, rejectedFirst: true } : {});
    submit(capstone, t, capstone.milestones[0], 1, at(-15 * DAY));
    if (k % 3 === 0) submit(capstone, t, capstone.milestones[0], 2, at(-12 * DAY), 1);
    if (k % 6 === 0) submit(capstone, t, capstone.milestones[0], 3, at(-11 * DAY), 2);
    if (k % 2 === 0) submit(capstone, t, capstone.milestones[1], 1, at(-1 * DAY), 3);
  });
  grade(capstone, capstone.milestones[0], 100, at(-8 * DAY), capstone.teams, (k) => 40 + ((k * 7) % 55), (k) => k % 7 === 0);

  // B: batch 2024, M1 due and graded but NOT released (marks must never reach students), M2 open.
  const systems = cycle(
    { courseName: "Operating Systems", title: "Systems project", batchYear: 2024, semester: 5, academicYear: "2026-27", createdByFacultyId: fac("bravo").id, teamDeadline: at(-30 * DAY), ideaDeadline: at(-20 * DAY), publishedAt: at(-35 * DAY) },
    [[-20 * DAY, -3 * DAY, -2 * DAY], [-2 * DAY, 2 * DAY, 3 * DAY], [3 * DAY, 12 * DAY, 13 * DAY]],
  );
  groups(students[2024], 4, 250).forEach((people, k) => {
    const t = team(systems, `Systems ${String(k + 1).padStart(3, "0")}`, people);
    idea(systems, t, "APPROVED", k % 6 === 0 ? { version: 2, rejectedFirst: true } : {});
    submit(systems, t, systems.milestones[0], 1, at(-5 * DAY));
    if (k % 4 === 0) submit(systems, t, systems.milestones[1], 1, at(-1 * DAY), 1);
  });
  grade(systems, systems.milestones[0], 50, null, systems.teams.slice(0, 200), (k) => 10 + ((k * 3) % 41), () => false);

  // C: batch 2025, idea stage (team deadline passed, idea deadline in 3 days): faculty place unteamed students.
  const web = cycle(
    { courseName: "Web Development", title: "Web project", batchYear: 2025, semester: 3, academicYear: "2026-27", createdByFacultyId: fac("charlie").id, teamDeadline: at(-2 * DAY), ideaDeadline: at(3 * DAY), publishedAt: at(-20 * DAY) },
    [[3 * DAY, 15 * DAY, 16 * DAY], [16 * DAY, 30 * DAY, 31 * DAY]],
  );
  for (let i = 0; i < 5; i += 1) {
    catalog.push({ id: randomUUID(), cycleId: web.id, title: `Catalog idea ${i + 1}`, description: "From the faculty's list.", link: null, createdById: fac("charlie").id, createdAt: at(-20 * DAY), updatedAt: at(-20 * DAY) });
  }
  groups(students[2025], 4, 200).forEach((people, k) => {
    const t = team(web, `Web ${String(k + 1).padStart(3, "0")}`, people);
    if (k < 80) idea(web, t, "SUBMITTED");
    else if (k < 140) idea(web, t, "APPROVED");
    else if (k < 170) idea(web, t, "REJECTED");
    else if (k < 180) idea(web, t, "APPROVED", { catalogIdea: catalog[k % 5] });
  });

  // D: batch 2025 elective in team formation (team deadline in 5 days), 60 enrolled, 10 small teams.
  const design = cycle(
    { courseName: "Interaction Design", title: "Design elective", batchYear: 2025, semester: 3, academicYear: "2026-27", kind: "ELECTIVE", createdByFacultyId: fac("delta").id, teamDeadline: at(5 * DAY), ideaDeadline: at(10 * DAY), publishedAt: at(-3 * DAY) },
    [[10 * DAY, 20 * DAY, 21 * DAY]],
  );
  const designRoster = students[2025].slice(800, 860);
  for (const person of designRoster) enrollments.push({ cycleId: design.id, email: person.email, addedById: fac("delta").id, createdAt: at(-4 * DAY) });
  let cursor = 0;
  for (let j = 0; j < 10; j += 1) {
    const size = (j % 3) + 1;
    team(design, `Design ${j + 1}`, designRoster.slice(cursor, cursor + size));
    cursor += size;
  }
  for (const person of designRoster.slice(50, 58)) seekers.push({ cycleId: design.id, userId: person.id, note: "Good at Figma", createdAt: at(-1 * DAY) });

  // E: batch 2024 elective with M1 open, 80 enrolled, 20 teams, half have submitted.
  const ml = cycle(
    { courseName: "Machine Learning", title: "ML elective", batchYear: 2024, semester: 5, academicYear: "2026-27", kind: "ELECTIVE", createdByFacultyId: fac("delta").id, teamDeadline: at(-20 * DAY), ideaDeadline: at(-10 * DAY), publishedAt: at(-25 * DAY) },
    [[-10 * DAY, 4 * DAY, 5 * DAY]],
  );
  for (const person of students[2024].slice(0, 80)) enrollments.push({ cycleId: ml.id, email: person.email, addedById: fac("delta").id, createdAt: at(-26 * DAY) });
  groups(students[2024].slice(0, 80), 4, 20).forEach((people, k) => {
    const t = team(ml, `ML ${k + 1}`, people);
    idea(ml, t, "APPROVED");
    if (k % 2 === 0) submit(ml, t, ml.milestones[0], 1, at(-2 * DAY));
  });

  // F: batch 2023, closed last term, released results. Only its 200 former members may read it.
  const lastTerm = cycle(
    { courseName: "Databases", title: "Last term project", batchYear: 2023, semester: 6, academicYear: "2025-26", createdByFacultyId: fac("echo").id, teamDeadline: at(-150 * DAY), ideaDeadline: at(-140 * DAY), status: "CLOSED", publishedAt: at(-160 * DAY), closedAt: at(-60 * DAY), createdAt: at(-170 * DAY), updatedAt: at(-60 * DAY) },
    [[-140 * DAY, -100 * DAY, -95 * DAY]],
  );
  groups(students[2023], 4, 50).forEach((people, k) => {
    const t = team(lastTerm, `Databases ${k + 1}`, people);
    idea(lastTerm, t, "APPROVED");
    submit(lastTerm, t, lastTerm.milestones[0], 1, at(-110 * DAY));
  });
  grade(lastTerm, lastTerm.milestones[0], 20, at(-90 * DAY), lastTerm.teams, (k) => 8 + (k % 12), () => false);

  // G: drafts. A core draft for 2025 and an elective draft with no roster (publish is blocked).
  const draftCore = cycle(
    { courseName: "Compilers", title: "Compiler draft", batchYear: 2025, semester: 3, academicYear: "2026-27", status: "DRAFT", publishedAt: null, createdByFacultyId: fac("foxtrot").id, teamDeadline: at(20 * DAY), ideaDeadline: at(30 * DAY) },
    [[30 * DAY, 60 * DAY, 61 * DAY]],
  );
  const draftElective = cycle(
    { courseName: "Cloud Computing", title: "Cloud elective draft", batchYear: 2023, semester: 7, academicYear: "2026-27", kind: "ELECTIVE", status: "DRAFT", publishedAt: null, createdByFacultyId: fac("alpha").id, teamDeadline: at(20 * DAY), ideaDeadline: at(30 * DAY) },
    [[30 * DAY, 60 * DAY, 61 * DAY]],
  );

  return {
    users, allowlist, cycles, milestones, enrollments, teams, members, seekers, catalog, ideas, reviews,
    submissions, gradings, evaluations, revisions,
    named: { admin, faculty, pendingStaff, students, deactivated, capstone, systems, web, design, ml, lastTerm, draftCore, draftElective },
  };
}

const TABLES = [
  "EvaluationRevision", "Evaluation", "MilestoneGrading", "Submission", "IdeaReview", "ProjectIdea", "CatalogIdea",
  "TeamSeeker", "TeamMember", "Team", "CycleEnrollment", "Milestone", "CourseProjectCycle", "AuditLog",
  "RefreshToken", "FacultyAccessRequest", "FacultyAllowlistEntry", "User",
];

async function run() {
  const url = databaseUrl();
  const parsed = new URL(url);
  if (parsed.pathname !== "/flowforge_qa" || parsed.port !== "5433") {
    throw new Error("Refusing to seed anything but the QA database flowforge_qa on port 5433");
  }
  const data = main();
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(",")} RESTART IDENTITY CASCADE`);
    await insert(client, "User", ["id", "googleSub", "email", "name", "role", "status", "batchYear", "tokenVersion", "createdAt", "updatedAt"], data.users);
    await insert(client, "FacultyAllowlistEntry", ["id", "email", "name", "source", "addedById"], data.allowlist);
    await insert(client, "CourseProjectCycle", ["id", "courseName", "title", "description", "batchYear", "semester", "academicYear", "minTeamSize", "maxTeamSize", "teamDeadline", "ideaDeadline", "ideaSource", "ideaLinkRequirement", "kind", "status", "createdByFacultyId", "publishedAt", "closedAt", "createdAt", "updatedAt"], data.cycles);
    await insert(client, "Milestone", ["id", "cycleId", "position", "name", "description", "submissionOpensAt", "submissionDueAt", "evaluationAt", "linkRequirement", "createdAt", "updatedAt"], data.milestones);
    await insert(client, "CycleEnrollment", ["cycleId", "email", "addedById", "createdAt"], data.enrollments);
    await insert(client, "Team", ["id", "cycleId", "name", "leaderId", "origin", "createdAt", "updatedAt"], data.teams);
    await insert(client, "TeamMember", ["teamId", "cycleId", "userId", "addedById", "addedAt"], data.members);
    await insert(client, "TeamSeeker", ["cycleId", "userId", "note", "createdAt"], data.seekers);
    await insert(client, "CatalogIdea", ["id", "cycleId", "title", "description", "link", "createdById", "createdAt", "updatedAt"], data.catalog);
    await insert(client, "ProjectIdea", ["id", "teamId", "cycleId", "title", "problem", "solution", "links", "status", "source", "catalogIdeaId", "version", "submittedById", "submittedAt", "createdAt", "updatedAt"], data.ideas);
    await insert(client, "IdeaReview", ["id", "ideaId", "version", "decision", "feedback", "reviewerId", "createdAt"], data.reviews);
    await insert(client, "Submission", ["id", "teamId", "cycleId", "milestoneId", "version", "links", "notes", "submittedById", "submittedAt"], data.submissions);
    await insert(client, "MilestoneGrading", ["milestoneId", "maxMarks", "releasedAt", "releasedById", "updatedAt"], data.gradings);
    await insert(client, "Evaluation", ["id", "milestoneId", "teamId", "cycleId", "marks", "feedback", "version", "evaluatedById", "createdAt", "updatedAt"], data.evaluations);
    await insert(client, "EvaluationRevision", ["id", "evaluationId", "version", "marks", "feedback", "evaluatedById", "createdAt"], data.revisions);
    await client.query("COMMIT");
    await client.query("ANALYZE");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }

  const n = data.named;
  const summary = (c) => ({
    id: c.id, title: c.title, batchYear: c.batchYear, kind: c.kind, status: c.status, owner: data.users.find((u) => u.id === c.createdByFacultyId).email,
    milestones: c.milestones.map((m) => ({ id: m.id, position: m.position })),
    teams: c.teams.map((t) => ({ id: t.id, name: t.name, leader: t.people[0].email, members: t.people.map((p) => p.email) })),
  });
  const manifest = {
    seededAt: NOW.toISOString(),
    counts: Object.fromEntries(["users", "cycles", "milestones", "enrollments", "teams", "members", "ideas", "reviews", "submissions", "gradings", "evaluations", "revisions"].map((k) => [k, data[k].length])),
    admin: n.admin.email,
    faculty: n.faculty.map((f) => f.email),
    pendingStaff: n.pendingStaff.email,
    deactivated: n.deactivated.email,
    students: Object.fromEntries(Object.entries(n.students).map(([year, list]) => [year, list.map((s) => s.email)])),
    cycles: Object.fromEntries(["capstone", "systems", "web", "design", "ml", "lastTerm", "draftCore", "draftElective"].map((key) => [key, summary(n[key])])),
  };
  fs.mkdirSync(QA_DIR, { recursive: true });
  fs.writeFileSync(path.join(QA_DIR, "manifest.json"), JSON.stringify(manifest, null, 1));
  console.log(JSON.stringify(manifest.counts));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
