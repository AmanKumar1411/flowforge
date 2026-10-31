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
import { milestone } from "./support/schedule";
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
  milestoneId: string;
  version: number;
  links: { type: string; url: string }[];
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

interface MilestoneBody {
  id: string;
  position: number;
  name: string;
}

const repository = {
  type: "GITHUB",
  url: "https://github.com/falcon/lost-and-found",
};
const drive = {
  type: "DRIVE",
  url: "https://drive.google.com/drive/folders/falcon-final",
};
const work = {
  links: [repository, { type: "DEMO", url: "https://falcon.example.edu" }],
  notes: "First version: board and photo upload",
};

// Phase 8: every submission belongs to a milestone with its own window and links (was one window per cycle).
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
   * three hours. M1 (GitHub) is open from day 1 to day 5; M2, the final one,
   * from day 5 to day 10 and asks for a Drive link only (the AIML example).
   */
  async function openCycle(): Promise<{
    cycleId: string;
    m1: string;
    m2: string;
  }> {
    const created = await owner.post<{
      id: string;
      milestones: MilestoneBody[];
    }>("/course-cycles", {
      body: {
        courseName: "Software Design",
        title: "Submissions",
        batchYear: 2026,
        semester: 7,
        academicYear: "2026-27",
        minTeamSize: 1,
        maxTeamSize: 3,
        teamDeadline: at(HOUR_MS),
        ideaDeadline: at(3 * HOUR_MS),
        milestones: [
          milestone("Prototype", at(DAY_MS), at(5 * DAY_MS)),
          milestone("Final", at(5 * DAY_MS), at(10 * DAY_MS), {
            linkRequirement: { required: ["DRIVE"], optional: [] },
          }),
        ],
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const cycleId = String(created.body.id);
    assert.equal(
      (await owner.post(`/course-cycles/${cycleId}/publish`)).status,
      200,
    );
    const [m1, m2] = created.body.milestones.map((m) => m.id);
    return { cycleId, m1, m2 };
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

  const route = (teamId: string, milestoneId: string) =>
    `/teams/${teamId}/milestones/${milestoneId}/submissions`;
  const submitWork = (
    student: Student,
    teamId: string,
    milestoneId: string,
    body: object = work,
  ) =>
    students[student].post<SubmissionBody>(route(teamId, milestoneId), {
      body,
    });

  it("keeps each milestone to its own window; any member adds versions; members, owner and admins read them", async () => {
    const { cycleId, m1, m2 } = await openCycle();
    const teamId = await team(cycleId, "aman", ["neha"]);
    await approvedIdea("aman", teamId);

    const early = await submitWork("neha", teamId, m1);
    assert.equal(early.status, 409);
    assert.equal(early.body.code, "SUBMISSION_NOT_OPEN");

    clock.advance(DAY_MS);
    const first = await submitWork("neha", teamId, m1, {
      links: [repository],
      notes: null,
    });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.deepEqual([first.body.version, first.body.milestoneId], [1, m1]);
    // M1 is open while M2 is still to come.
    const upcoming = await submitWork("aman", teamId, m2, { links: [drive] });
    assert.equal(upcoming.body.code, "SUBMISSION_NOT_OPEN");
    const second = await submitWork("aman", teamId, m1);
    assert.equal(second.body.version, 2);
    assert.deepEqual(second.body.links, work.links);

    for (const reader of [students.neha, owner, admin]) {
      const listed = await reader.get<SubmissionBody[]>(route(teamId, m1));
      assert.equal(listed.status, 200);
      assert.deepEqual(
        listed.body.map((s) => s.version),
        [2, 1],
      );
    }
    for (const outsider of [students.ravi, otherFaculty]) {
      const hidden = await outsider.get(route(teamId, m1));
      assert.equal(hidden.status, 404);
      assert.equal(hidden.body.code, "TEAM_NOT_FOUND");
    }

    // At M1's due date it closes and M2 opens; M2's versions start again at 1.
    clock.advance(4 * DAY_MS);
    const late = await submitWork("aman", teamId, m1);
    assert.equal(late.status, 409);
    assert.equal(late.body.code, "SUBMISSION_CLOSED");
    const final = await submitWork("aman", teamId, m2, {
      links: [drive],
      notes: "Final deck",
    });
    assert.equal(final.status, 201, JSON.stringify(final.body));
    assert.equal(final.body.version, 1);
    assert.deepEqual(
      (await auditActions(app.prisma, { action: "SUBMISSION_CREATED" }))
        .filter(
          (row) => (row.metadata as { teamId?: string }).teamId === teamId,
        )
        .map((row) => [
          (row.metadata as { milestoneId: string }).milestoneId,
          (row.metadata as { version: number }).version,
        ]),
      [
        [m1, 1],
        [m1, 2],
        [m2, 1],
      ],
    );
  });

  it("asks each milestone for its own links: Drive only for the final one", async () => {
    const { cycleId, m1, m2 } = await openCycle();
    const teamId = await team(cycleId, "aman", []);
    await approvedIdea("aman", teamId);
    clock.advance(DAY_MS);
    for (const [links, code] of [
      [[], "MISSING_REQUIRED_LINK"],
      [[{ type: "GITHUB", url: "https://github.com/falcon" }], "INVALID_LINK"],
      [[repository, repository], "INVALID_LINK"],
      [[repository, drive], "LINK_NOT_ALLOWED"],
    ] as const) {
      const refused = await submitWork("aman", teamId, m1, { links });
      assert.equal(refused.status, 400, JSON.stringify(links));
      assert.equal(refused.body.code, code);
    }
    clock.advance(4 * DAY_MS);
    const githubOnly = await submitWork("aman", teamId, m2, {
      links: [repository],
    });
    assert.equal(githubOnly.status, 400);
    assert.equal(githubOnly.body.code, "LINK_NOT_ALLOWED");
    const driveOnly = await submitWork("aman", teamId, m2, { links: [drive] });
    assert.equal(driveOnly.status, 201, JSON.stringify(driveOnly.body));
    const tooLong = await submitWork("aman", teamId, m2, {
      links: [drive],
      notes: "x".repeat(4001),
    });
    assert.equal(tooLong.body.code, "VALIDATION_FAILED");
  });

  it("needs an approved idea; a pick from the faculty's catalog is enough", async () => {
    const { cycleId, m1 } = await openCycle();
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
      const refused = await submitWork(student, teamId, m1);
      assert.equal(refused.status, 409);
      assert.equal(refused.body.code, "IDEA_NOT_APPROVED");
    }
    assert.equal((await submitWork("priya", picker, m1)).status, 201);
  });

  it("closes when the cycle closes; earlier versions stay; a milestone of another cycle is not found", async () => {
    const { cycleId, m1 } = await openCycle();
    const other = await openCycle();
    const teamId = await team(cycleId, "aman", []);
    await approvedIdea("aman", teamId);
    clock.advance(DAY_MS);
    await submitWork("aman", teamId, m1);
    const foreign = await submitWork("aman", teamId, other.m1);
    assert.equal(foreign.status, 404);
    assert.equal(foreign.body.code, "MILESTONE_NOT_FOUND");
    await owner.post(`/course-cycles/${cycleId}/close`);
    const closed = await submitWork("aman", teamId, m1);
    assert.equal(closed.status, 409);
    assert.equal(closed.body.code, "SUBMISSION_CLOSED");
    assert.equal(
      (await students.aman.get<SubmissionBody[]>(route(teamId, m1))).body
        .length,
      1,
    );
  });

  it("lists every team of the cycle for its faculty and admins, per milestone, with its latest version; history is paged per team", async () => {
    const { cycleId, m1, m2 } = await openCycle();
    const falcon = await team(cycleId, "aman", ["neha"]);
    await team(cycleId, "ravi", []);
    await approvedIdea("aman", falcon);
    clock.advance(DAY_MS);
    await submitWork("aman", falcon, m1);
    await submitWork("neha", falcon, m1);
    const path = (milestoneId: string) =>
      `/course-cycles/${cycleId}/milestones/${milestoneId}/submissions`;
    for (const reader of [owner, admin]) {
      const listed = await reader.get<CycleSubmissionBody[]>(path(m1));
      assert.equal(listed.status, 200);
      const rows = new Map(listed.body.map((row) => [row.team.name, row]));
      const aman = rows.get("aman's team");
      assert.deepEqual(
        [aman?.latest?.version, aman?.versionCount, "versions" in (aman ?? {})],
        [2, 2, false],
      );
      assert.equal(rows.get("ravi's team")?.latest, null);
      // The history, a page at a time (H4): newest first, then older than the last one seen.
      const history = (query: string) =>
        reader.get<{ version: number }[]>(
          `/teams/${falcon}/milestones/${m1}/submissions${query}`,
        );
      const first = await history("?limit=1");
      assert.deepEqual(
        first.body.map((v) => v.version),
        [2],
      );
      const next = await history("?limit=1&before=2");
      assert.deepEqual(
        next.body.map((v) => v.version),
        [1],
      );
      assert.equal((await history("?limit=0")).status, 400);
    }
    assert.equal(
      (await owner.get<CycleSubmissionBody[]>(path(m2))).body[0].versionCount,
      0,
    );
    for (const outsider of [otherFaculty, students.aman]) {
      assert.notEqual((await outsider.get(path(m1))).status, 200);
    }
  });

  it("numbers versions one after another when two members submit at once", async () => {
    const { cycleId, m1 } = await openCycle();
    const teamId = await team(cycleId, "aman", ["neha", "kiran"]);
    await approvedIdea("aman", teamId);
    clock.advance(DAY_MS);
    const results = await Promise.all(
      (["aman", "neha"] as const).map((student) =>
        submitWork(student, teamId, m1),
      ),
    );
    assert.deepEqual(
      results.map((result) => result.status),
      [201, 201],
    );
    assert.deepEqual(
      results.map((result) => result.body.version).sort(),
      [1, 2],
    );
    assert.equal(
      await app.prisma.submission.count({ where: { teamId, milestoneId: m1 } }),
      2,
    );
  });

  it("is guarded by the database: unique versions per milestone, from 1, in the team's and the milestone's own cycle", async () => {
    const { cycleId, m1 } = await openCycle();
    const other = await openCycle();
    const teamId = await team(cycleId, "aman", []);
    await approvedIdea("aman", teamId);
    clock.advance(DAY_MS);
    await submitWork("aman", teamId, m1);
    const insert = (version: number, cycle: string, milestoneId: string) =>
      app.prisma.$executeRaw`
        INSERT INTO "Submission" ("id", "teamId", "cycleId", "milestoneId", "version", "links", "submittedById", "submittedAt")
        VALUES (gen_random_uuid(), ${teamId}, ${cycle}, ${milestoneId}, ${version}, '[]'::jsonb, ${ids.aman}, now())`;
    await assert.rejects(
      insert(1, cycleId, m1),
      /Submission_teamId_milestoneId_version_key/,
    );
    await assert.rejects(insert(0, cycleId, m1), /Submission_version_check/);
    await assert.rejects(
      insert(2, other.cycleId, other.m1),
      /Submission_teamId_cycleId_fkey/,
    );
    await assert.rejects(
      insert(2, cycleId, other.m1),
      /Submission_milestoneId_cycleId_fkey/,
    );
  });
});
