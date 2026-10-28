import { after, before, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { FixedClock } from "../src/common/testing/fixed-clock";
import {
  auditActions,
  BOOTSTRAP_ADMIN,
  DOMAIN,
  startTestApp,
  TestApp,
} from "./support/test-app";
import { TestBrowser } from "./support/test-browser";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

type Student = "aman" | "neha" | "ravi" | "priya" | "kiran";

const EMAILS: Record<Student, string> = {
  aman: `aman.k26csai${DOMAIN}`,
  neha: `neha.t26csai${DOMAIN}`,
  ravi: `ravi.b26csai${DOMAIN}`,
  priya: `priya.m26csai${DOMAIN}`,
  kiran: `kiran.p26csai${DOMAIN}`,
};

interface SubmissionBody {
  id: string;
  version: number;
  repositoryUrl: string;
  demoUrl: string | null;
  notes: string | null;
  submittedBy: { id: string };
  code?: string;
}

interface CycleSubmissionBody {
  team: { id: string; name: string; leader: { name: string } };
  idea: { title: string; status: string; source: string } | null;
  latest: SubmissionBody | null;
  versionCount: number;
}

const work = {
  repositoryUrl: "https://github.com/falcon/lost-and-found",
  demoUrl: "https://falcon.example.edu",
  notes: "First version: board and photo upload",
};

describe("Submissions", () => {
  // Each test builds its cycle relative to this clock and moves it past deadlines.
  const clock = new FixedClock(new Date());
  let app: TestApp;
  let admin: TestBrowser;
  let owner: TestBrowser;
  let otherFaculty: TestBrowser;
  const students = {} as Record<Student, TestBrowser>;
  const ids = {} as Record<Student, string>;

  before(async () => {
    app = await startTestApp({ clock });
    await app.reset();
    admin = await app.browser().signIn(BOOTSTRAP_ADMIN);
    for (const email of [`vatsala.s${DOMAIN}`, `anil.kr${DOMAIN}`]) {
      await admin.post("/admin/faculty-allowlist", { body: { email } });
    }
    owner = await app.browser().signIn(`vatsala.s${DOMAIN}`);
    otherFaculty = await app.browser().signIn(`anil.kr${DOMAIN}`);
    for (const [key, email] of Object.entries(EMAILS)) {
      const name = key[0].toUpperCase() + key.slice(1);
      const browser = await app.browser().signIn(email, name);
      students[key as Student] = browser;
      ids[key as Student] = String((await browser.get("/auth/me")).body.id);
    }
  });
  after(() => app.close());

  const at = (offsetMs: number) =>
    new Date(clock.now().getTime() + offsetMs).toISOString();

  /**
   * Published, batch 2026, 1 to 3 members: teams for an hour, ideas due after
   * three hours, submissions open after a day and close after thirty.
   */
  async function openCycle() {
    const created = await owner.post("/course-cycles", {
      body: {
        courseName: "Software Design",
        title: "Submissions",
        batchYear: 2026,
        semester: 7,
        academicYear: "2026-27",
        submissionStartAt: at(DAY_MS),
        submissionDeadline: at(30 * DAY_MS),
        minTeamSize: 1,
        maxTeamSize: 3,
        teamFormationDeadline: at(HOUR_MS),
        ideaDeadline: at(3 * HOUR_MS),
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const cycleId = String(created.body.id);
    assert.equal(
      (await owner.post(`/course-cycles/${cycleId}/publish`)).status,
      200,
    );
    return cycleId;
  }

  async function team(cycleId: string, leader: Student, members: Student[]) {
    const created = await students[leader].post<{ id: string }>(
      `/course-cycles/${cycleId}/teams`,
      {
        body: {
          name: `${leader}'s team`,
          memberIds: members.map((member) => ids[member]),
        },
      },
    );
    assert.equal(created.status, 201, JSON.stringify(created.body));
    return created.body.id;
  }

  /** The leader proposes an idea and the owner approves it. */
  async function approvedIdea(leader: Student, teamId: string) {
    const proposed = await students[leader].put<{ version: number }>(
      `/teams/${teamId}/idea`,
      {
        body: {
          title: "Campus lost and found",
          problem: "Things get lost on campus",
          solution: "A board with photos",
        },
      },
    );
    assert.equal(proposed.status, 200, JSON.stringify(proposed.body));
    const approved = await owner.post(`/teams/${teamId}/idea/review`, {
      body: { version: proposed.body.version, decision: "APPROVED" },
    });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
  }

  const submitWork = (student: Student, teamId: string, body: object = work) =>
    students[student].post<SubmissionBody>(`/teams/${teamId}/submissions`, {
      body,
    });

  it("opens at 'submissions open'; any member adds versions; members, owner and admins read them", async () => {
    const cycleId = await openCycle();
    const teamId = await team(cycleId, "aman", ["neha"]);
    await approvedIdea("aman", teamId);

    const early = await submitWork("neha", teamId);
    assert.equal(early.status, 409);
    assert.equal(early.body.code, "SUBMISSION_NOT_OPEN");

    clock.advance(DAY_MS);
    const first = await submitWork("neha", teamId, { ...work, demoUrl: null });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.version, 1);
    assert.equal(first.body.submittedBy.id, ids.neha);
    const second = await submitWork("aman", teamId, {
      ...work,
      notes: "Second version: owner notifications",
    });
    assert.equal(second.body.version, 2);

    for (const reader of [students.neha, owner, admin]) {
      const list = await reader.get<SubmissionBody[]>(
        `/teams/${teamId}/submissions`,
      );
      assert.equal(list.status, 200);
      assert.deepEqual(
        list.body.map((entry) => entry.version),
        [2, 1],
      );
    }
    for (const outsider of [students.ravi, otherFaculty]) {
      assert.equal(
        (await outsider.get(`/teams/${teamId}/submissions`)).status,
        404,
      );
    }
    assert.equal((await submitWork("ravi", teamId)).status, 404);
    assert.deepEqual(
      (await auditActions(app.prisma, { entityId: second.body.id })).map(
        (entry) => [entry.action, entry.metadata.version],
      ),
      [["SUBMISSION_CREATED", 2]],
    );
  });

  it("needs an approved idea; a pick from the faculty's catalog is enough", async () => {
    const cycleId = await openCycle();
    const waiting = await team(cycleId, "aman", []);
    const none = await team(cycleId, "ravi", []);
    const picker = await team(cycleId, "priya", []);
    await students.aman.put(`/teams/${waiting}/idea`, {
      body: { title: "T", problem: "P", solution: "S" },
    });
    const offered = await owner.post<{ id: string }>(
      `/course-cycles/${cycleId}/idea-catalog`,
      { body: { title: "Library seat finder", description: "Free seats" } },
    );
    await students.priya.post(`/teams/${picker}/idea/pick`, {
      body: { catalogIdeaId: offered.body.id },
    });
    clock.advance(DAY_MS);

    for (const [student, teamId] of [
      ["aman", waiting],
      ["ravi", none],
    ] as const) {
      const refused = await submitWork(student, teamId);
      assert.equal(refused.status, 409);
      assert.equal(refused.body.code, "IDEA_NOT_APPROVED");
    }
    assert.equal((await submitWork("priya", picker)).status, 201);
  });

  it("closes at the deadline and when the cycle closes; earlier versions stay", async () => {
    const cycleId = await openCycle();
    const teamId = await team(cycleId, "aman", []);
    await approvedIdea("aman", teamId);
    clock.advance(DAY_MS);
    await submitWork("aman", teamId);
    clock.advance(29 * DAY_MS);
    const late = await submitWork("aman", teamId);
    assert.equal(late.status, 409);
    assert.equal(late.body.code, "SUBMISSION_CLOSED");
    assert.equal(
      (await students.aman.get<unknown[]>(`/teams/${teamId}/submissions`)).body
        .length,
      1,
    );

    const other = await openCycle();
    const otherTeam = await team(other, "neha", []);
    await approvedIdea("neha", otherTeam);
    clock.advance(DAY_MS);
    await owner.post(`/course-cycles/${other}/close`);
    assert.equal(
      (await submitWork("neha", otherTeam)).body.code,
      "SUBMISSION_CLOSED",
    );
  });

  it("lists every team of the cycle for its faculty and admins, with the latest version", async () => {
    const cycleId = await openCycle();
    const falcon = await team(cycleId, "aman", ["neha"]);
    const kestrel = await team(cycleId, "ravi", []);
    await approvedIdea("aman", falcon);
    clock.advance(DAY_MS);
    await submitWork("aman", falcon);
    await submitWork("neha", falcon, { ...work, notes: "v2" });

    for (const reader of [owner, admin]) {
      const rows = await reader.get<CycleSubmissionBody[]>(
        `/course-cycles/${cycleId}/submissions`,
      );
      assert.equal(rows.status, 200);
      const byTeam = new Map(rows.body.map((row) => [row.team.id, row]));
      assert.equal(byTeam.get(falcon)?.versionCount, 2);
      assert.equal(byTeam.get(falcon)?.latest?.notes, "v2");
      assert.equal(byTeam.get(falcon)?.idea?.status, "APPROVED");
      assert.equal(byTeam.get(kestrel)?.latest, null);
      assert.equal(byTeam.get(kestrel)?.idea, null);
    }
    assert.equal(
      (await otherFaculty.get(`/course-cycles/${cycleId}/submissions`)).status,
      404,
    );
    assert.equal(
      (await students.aman.get(`/course-cycles/${cycleId}/submissions`)).status,
      403,
    );
  });

  it("checks the links and notes", async () => {
    const cycleId = await openCycle();
    const teamId = await team(cycleId, "aman", []);
    await approvedIdea("aman", teamId);
    clock.advance(DAY_MS);
    for (const body of [
      {},
      { repositoryUrl: "github.com/falcon" },
      { repositoryUrl: "ftp://example.edu/app" },
      { ...work, demoUrl: "javascript:alert(1)" },
      { ...work, notes: "x".repeat(4001) },
      { ...work, extra: true },
    ]) {
      assert.equal(
        (await submitWork("aman", teamId, body)).status,
        400,
        JSON.stringify(body),
      );
    }
  });

  it("numbers versions one after another when two members submit at once", async () => {
    const cycleId = await openCycle();
    const teamId = await team(cycleId, "aman", ["neha", "kiran"]);
    await approvedIdea("aman", teamId);
    clock.advance(DAY_MS);
    const results = await Promise.all(
      (["aman", "neha", "kiran"] as const).map((student) =>
        submitWork(student, teamId),
      ),
    );
    assert.deepEqual(
      results.map((result) => result.status),
      [201, 201, 201],
    );
    assert.deepEqual(
      results.map((result) => result.body.version).sort(),
      [1, 2, 3],
    );
  });

  it("is guarded by the database: unique versions, from 1, in the team's own cycle", async () => {
    const cycleId = await openCycle();
    const otherCycle = await openCycle();
    const teamId = await team(cycleId, "aman", []);
    await approvedIdea("aman", teamId);
    clock.advance(DAY_MS);
    await submitWork("aman", teamId);
    const insert = (version: number, cycle: string) =>
      app.prisma.$executeRaw`
        INSERT INTO "Submission" ("id", "teamId", "cycleId", "version", "repositoryUrl", "submittedById", "submittedAt")
        VALUES (gen_random_uuid(), ${teamId}, ${cycle}, ${version}, 'https://github.com/x/y', ${ids.aman}, now())`;
    await assert.rejects(insert(1, cycleId), /Submission_teamId_version_key/);
    await assert.rejects(insert(0, cycleId), /Submission_version_check/);
    await assert.rejects(
      insert(2, otherCycle),
      /Submission_teamId_cycleId_fkey/,
    );
  });
});
