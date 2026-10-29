import { after, before, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
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

interface TeamBody {
  id: string;
  cycleId: string;
  name: string;
  leaderId: string;
  members: { userId: string; name: string; isLeader: boolean }[];
  // Error responses share the endpoint.
  code?: string;
  message?: string;
}

interface CandidateBody {
  id: string;
  name: string;
  availability: string;
}

type Student =
  "aman" | "neha" | "ravi" | "priya" | "kiran" | "dev" | "older" | "gone";

const STUDENT_EMAILS: Record<Student, string> = {
  aman: `aman.k26csai${DOMAIN}`,
  neha: `neha.t26csai${DOMAIN}`,
  ravi: `ravi.b26csai${DOMAIN}`,
  priya: `priya.m26csai${DOMAIN}`,
  kiran: `kiran.p26csai${DOMAIN}`,
  dev: `dev.s26csai${DOMAIN}`,
  older: `older.r25csai${DOMAIN}`,
  gone: `gone.x26csai${DOMAIN}`,
};

describe("Teams", () => {
  // Team formation reads this clock; tests move it past deadlines. Each test builds its own cycle relative to it.
  const clock = new FixedClock(new Date());
  let app: TestApp;
  let admin: TestBrowser;
  let owner: TestBrowser;
  let otherFaculty: TestBrowser;
  let pending: TestBrowser;
  const students = {} as Record<Student, TestBrowser>;
  const ids = {} as Record<Student, string>;

  before(async () => {
    app = await startTestApp({ clock });
    await app.reset();
    admin = await app.browser().signIn(BOOTSTRAP_ADMIN);
    for (const email of [`vatsala.s${DOMAIN}`, `anil.kr${DOMAIN}`]) {
      await admin.post("/admin/faculty-allowlist", { body: { email } });
    }
    owner = await app.browser().signIn(`vatsala.s${DOMAIN}`, "Vatsala S");
    otherFaculty = await app.browser().signIn(`anil.kr${DOMAIN}`);
    pending = await app.browser().signIn(`sahil.a${DOMAIN}`);
    for (const [key, email] of Object.entries(STUDENT_EMAILS)) {
      const name = key[0].toUpperCase() + key.slice(1);
      const browser = await app.browser().signIn(email, name);
      students[key as Student] = browser;
      ids[key as Student] = String((await browser.get("/auth/me")).body.id);
    }
    await admin.post(`/admin/users/${ids.gone}/deactivate`);
  });
  after(() => app.close());

  const at = (offsetMs: number) =>
    new Date(clock.now().getTime() + offsetMs).toISOString();

  /** A published batch-2026 cycle for 2 to 3 members, formation open for an hour. */
  async function openCycle(overrides: Record<string, unknown> = {}) {
    const created = await owner.post("/course-cycles", {
      body: {
        courseName: "Software Design",
        title: "Team projects",
        batchYear: 2026,
        semester: 7,
        academicYear: "2026-27",
        minTeamSize: 2,
        maxTeamSize: 3,
        teamDeadline: at(HOUR_MS),
        // Phase 8: an idea deadline and a milestone replace the submission window.
        ideaDeadline: at(2 * DAY_MS),
        milestones: [milestone("Final", at(2 * DAY_MS), at(30 * DAY_MS))],
        ...overrides,
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

  async function createTeam(
    cycleId: string,
    leader: Student,
    members: Student[],
    name = `${leader}'s team`,
  ) {
    return students[leader].post<TeamBody>(`/course-cycles/${cycleId}/teams`, {
      body: { name, memberIds: members.map((member) => ids[member]) },
    });
  }

  const memberIdsOf = (team: TeamBody) =>
    team.members.map((member) => member.userId).sort();

  /** The student's teams in one cycle. /teams/mine spans cycles, and users outlive each test. */
  const myTeamsIn = async (who: Student, cycleId: string) =>
    (await students[who].get<TeamBody[]>("/teams/mine")).body.filter(
      (team) => team.cycleId === cycleId,
    );

  describe("cycle team rules", () => {
    it("are set by the faculty and shown to students", async () => {
      const cycleId = await openCycle();
      const cycle = await students.aman.get(`/course-cycles/${cycleId}`);
      assert.equal(cycle.status, 200);
      assert.equal(cycle.body.minTeamSize, 2);
      assert.equal(cycle.body.maxTeamSize, 3);
      assert.equal(cycle.body.teamDeadline, at(HOUR_MS));
    });

    it("are validated when the cycle is created", async () => {
      const base = {
        courseName: "Software Design",
        title: "Invalid",
        batchYear: 2026,
        semester: 7,
        academicYear: "2026-27",
        teamDeadline: at(HOUR_MS),
        ideaDeadline: at(DAY_MS),
      };
      const cases: [Record<string, unknown>, string][] = [
        [{ minTeamSize: 3, maxTeamSize: 2 }, "INVALID_TEAM_SIZE"],
        [{ maxTeamSize: 11 }, "VALIDATION_FAILED"],
        [{ minTeamSize: 0 }, "VALIDATION_FAILED"],
        // Phase 8: the team deadline must come before the idea deadline.
        [{ teamDeadline: at(10 * DAY_MS) }, "INVALID_IDEA_DEADLINE"],
      ];
      for (const [rules, code] of cases) {
        const result = await owner.post("/course-cycles", {
          body: { ...base, ...rules },
        });
        assert.equal(result.status, 400, JSON.stringify(rules));
        assert.equal(result.body.code, code, JSON.stringify(rules));
      }
    });

    it("fix sizes at publish; an open deadline can move forward but never back into the past", async () => {
      const cycleId = await openCycle();
      const patch = (body: Record<string, unknown>) =>
        owner.patch(`/course-cycles/${cycleId}`, { body });

      const size = await patch({ maxTeamSize: 4 });
      assert.equal(size.status, 409);
      assert.equal(size.body.code, "CYCLE_FIELD_LOCKED");
      const past = await patch({ teamDeadline: at(-MINUTE_MS) });
      assert.equal(past.status, 400);
      assert.equal(past.body.code, "INVALID_TEAM_DEADLINE");
      const extended = await patch({ teamDeadline: at(3 * HOUR_MS) });
      assert.equal(extended.status, 200);
      assert.equal(extended.body.teamDeadline, at(3 * HOUR_MS));
    });
  });

  describe("forming a team", () => {
    it("makes the caller the leader; chosen members are in the team at once, without accepting anything", async () => {
      const cycleId = await openCycle();
      const created = await createTeam(cycleId, "aman", ["neha"], "Falcon");

      assert.equal(created.status, 201, JSON.stringify(created.body));
      assert.equal(created.body.name, "Falcon");
      assert.equal(created.body.leaderId, ids.aman);
      assert.deepEqual(
        created.body.members.map((member) => [member.name, member.isLeader]),
        [
          ["Aman", true],
          ["Neha", false],
        ],
      );

      assert.deepEqual(
        (await myTeamsIn("neha", cycleId)).map((team) => team.id),
        [created.body.id],
      );
      const inCycle = await students.neha.get<TeamBody[]>(
        `/course-cycles/${cycleId}/teams`,
      );
      assert.deepEqual(
        inCycle.body.map((team) => team.id),
        [created.body.id],
      );
      assert.deepEqual(
        await auditActions(app.prisma, { entityId: created.body.id }),
        [
          {
            action: "TEAM_CREATED",
            metadata: { cycleId, memberIds: [ids.neha], origin: "STUDENT" },
          },
        ],
      );
    });

    it("enforces the size range (leader included) and who may join", async () => {
      const cycleId = await openCycle();
      const cases: [Student[] | string[], number, string][] = [
        [[], 400, "TEAM_SIZE_OUT_OF_RANGE"],
        [["neha", "ravi", "priya"], 400, "TEAM_SIZE_OUT_OF_RANGE"],
        [["older"], 400, "INELIGIBLE_TEAM_MEMBER"],
        [["gone"], 400, "INELIGIBLE_TEAM_MEMBER"],
      ];
      for (const [members, status, code] of cases) {
        const result = await createTeam(cycleId, "aman", members as Student[]);
        assert.equal(result.status, status, JSON.stringify(members));
        assert.equal(result.body.code, code, JSON.stringify(members));
      }
      const odd = [
        {
          name: "Faculty",
          memberIds: [String((await owner.get("/auth/me")).body.id)],
          code: "INELIGIBLE_TEAM_MEMBER",
        },
        {
          name: "Ghost",
          memberIds: [randomUUID()],
          code: "INELIGIBLE_TEAM_MEMBER",
        },
        { name: "Not an id", memberIds: ["neha"], code: "VALIDATION_FAILED" },
        { name: "   ", memberIds: [ids.neha], code: "VALIDATION_FAILED" },
      ];
      for (const { code, ...body } of odd) {
        const result = await students.aman.post(
          `/course-cycles/${cycleId}/teams`,
          { body },
        );
        assert.equal(result.status, 400, body.name);
        assert.equal(result.body.code, code, body.name);
      }
      assert.equal(await app.prisma.team.count({ where: { cycleId } }), 0);
    });

    it("never puts a student in two teams of one cycle", async () => {
      const cycleId = await openCycle();
      assert.equal((await createTeam(cycleId, "aman", ["neha"])).status, 201);

      const taken = await createTeam(cycleId, "ravi", ["neha"]);
      assert.equal(taken.status, 409);
      assert.equal(taken.body.code, "STUDENT_ALREADY_IN_TEAM");
      assert.match(String(taken.body.message), /Neha/);

      const secondTeam = await createTeam(cycleId, "neha", ["ravi"]);
      assert.equal(secondTeam.status, 409);
      assert.equal(secondTeam.body.code, "STUDENT_ALREADY_IN_TEAM");
    });

    it("lets the database settle two leaders racing for the same student", async () => {
      const cycleId = await openCycle();
      const results = await Promise.all([
        createTeam(cycleId, "ravi", ["kiran"]),
        createTeam(cycleId, "priya", ["kiran"]),
      ]);
      assert.deepEqual(
        results.map((result) => result.status).sort(),
        [201, 409],
      );
      assert.equal(
        results.find((result) => result.status === 409)?.body.code,
        "STUDENT_ALREADY_IN_TEAM",
      );
      assert.equal(
        await app.prisma.teamMember.count({
          where: { cycleId, userId: ids.kiran },
        }),
        1,
      );
    });

    it("hides another batch's cycle", async () => {
      const cycleId = await openCycle();
      const result = await createTeam(cycleId, "older", []);
      assert.equal(result.status, 404);
      assert.equal(result.body.code, "CYCLE_NOT_FOUND");
    });
  });

  describe("searching for teammates", () => {
    it("finds batch-mates by name or email start and marks who is taken", async () => {
      const cycleId = await openCycle();
      await createTeam(cycleId, "aman", ["neha"]);
      await createTeam(cycleId, "priya", ["dev"]);
      const search = (who: Student, q: string) =>
        students[who].get<CandidateBody[]>(
          `/course-cycles/${cycleId}/team-candidates?q=${encodeURIComponent(q)}`,
        );

      const byName = await search("ravi", "neha");
      assert.equal(byName.status, 200);
      assert.deepEqual(
        byName.body.map((c) => [c.name, c.availability]),
        [["Neha", "IN_ANOTHER_TEAM"]],
      );
      assert.deepEqual(
        (await search("aman", "NE")).body.map((c) => [c.name, c.availability]),
        [["Neha", "IN_YOUR_TEAM"]],
      );
      assert.deepEqual(
        (await search("aman", "kiran.p26")).body.map((c) => [
          c.name,
          c.availability,
        ]),
        [["Kiran", "AVAILABLE"]],
      );
      // Never the caller, another batch or a deactivated student.
      assert.deepEqual((await search("aman", "aman")).body, []);
      assert.deepEqual((await search("aman", "older")).body, []);
      assert.deepEqual((await search("aman", "gone")).body, []);
    });

    it("rejects short or wildcard queries", async () => {
      const cycleId = await openCycle();
      for (const q of ["a", " a ", "%%", "ne_ha"]) {
        const result = await students.aman.get(
          `/course-cycles/${cycleId}/team-candidates?q=${encodeURIComponent(q)}`,
        );
        assert.equal(result.status, 400, q);
        assert.equal(result.body.code, "VALIDATION_FAILED", q);
      }
    });
  });

  describe("changing a team", () => {
    it("is for the leader only, and the leader always stays", async () => {
      const cycleId = await openCycle();
      const team = (await createTeam(cycleId, "aman", ["neha"])).body;

      const byMember = await students.neha.patch(`/teams/${team.id}`, {
        body: { name: "Taken over" },
      });
      assert.equal(byMember.status, 403);
      assert.equal(byMember.body.code, "NOT_TEAM_LEADER");
      const disbandByMember = await students.neha.delete(`/teams/${team.id}`);
      assert.equal(disbandByMember.status, 403);
      const byOutsider = await students.ravi.patch(`/teams/${team.id}`, {
        body: { name: "Taken over" },
      });
      assert.equal(byOutsider.status, 404);
      assert.equal(byOutsider.body.code, "TEAM_NOT_FOUND");

      // Leaving everyone out keeps the leader, which here is below the minimum.
      const empty = await students.aman.patch(`/teams/${team.id}`, {
        body: { memberIds: [] },
      });
      assert.equal(empty.body.code, "TEAM_SIZE_OUT_OF_RANGE");

      const swapped = await students.aman.patch<TeamBody>(`/teams/${team.id}`, {
        body: { memberIds: [ids.ravi], name: "Kestrel" },
      });
      assert.equal(swapped.status, 200, JSON.stringify(swapped.body));
      assert.equal(swapped.body.leaderId, ids.aman);
      assert.equal(swapped.body.name, "Kestrel");
      assert.deepEqual(memberIdsOf(swapped.body), [ids.aman, ids.ravi].sort());

      assert.equal((await students.neha.get(`/teams/${team.id}`)).status, 404);
      assert.deepEqual(await myTeamsIn("neha", cycleId), []);
      assert.equal((await students.ravi.get(`/teams/${team.id}`)).status, 200);
      assert.deepEqual(
        (
          await auditActions(app.prisma, {
            action: "TEAM_UPDATED",
            entityId: team.id,
          })
        ).map((row) => row.metadata),
        [{ cycleId, added: [ids.ravi], removed: [ids.neha], renamed: true }],
      );
    });

    it("runs concurrent changes to one team one at a time, so the size limit holds", async () => {
      const cycleId = await openCycle();
      const team = (await createTeam(cycleId, "aman", ["neha"])).body;
      // Each change alone gives 3 members. Applied to the same snapshot, they would give 4.
      const results = await Promise.all(
        (["ravi", "priya"] as const).map((extra) =>
          students.aman.patch(`/teams/${team.id}`, {
            body: { memberIds: [ids.neha, ids[extra]] },
          }),
        ),
      );
      assert.deepEqual(
        results.map((result) => result.status),
        [200, 200],
      );
      assert.equal(
        await app.prisma.teamMember.count({ where: { teamId: team.id } }),
        3,
      );
    });

    it("disbanding frees every member", async () => {
      const cycleId = await openCycle();
      const team = (await createTeam(cycleId, "aman", ["neha", "ravi"])).body;

      assert.equal(
        (await students.aman.delete(`/teams/${team.id}`)).status,
        204,
      );
      assert.deepEqual(await myTeamsIn("neha", cycleId), []);
      assert.equal(
        await app.prisma.teamMember.count({ where: { cycleId } }),
        0,
      );
      assert.equal((await createTeam(cycleId, "neha", ["ravi"])).status, 201);
      const [disbanded] = await auditActions(app.prisma, {
        action: "TEAM_DISBANDED",
        entityId: team.id,
      });
      assert.deepEqual(
        (disbanded.metadata.memberIds as string[]).sort(),
        [ids.aman, ids.neha, ids.ravi].sort(),
      );
    });
  });

  describe("the formation deadline", () => {
    it("fixes every team and keeps it readable; the faculty can no longer move it", async () => {
      const cycleId = await openCycle();
      const team = (await createTeam(cycleId, "aman", ["neha"])).body;
      clock.advance(HOUR_MS);

      const attempts = [
        students.aman.patch(`/teams/${team.id}`, { body: { name: "Late" } }),
        students.aman.delete(`/teams/${team.id}`),
        createTeam(cycleId, "ravi", ["priya"]),
        students.ravi.get(`/course-cycles/${cycleId}/team-candidates?q=pr`),
      ];
      for (const result of await Promise.all(attempts)) {
        assert.equal(result.status, 409);
        assert.equal(result.body.code, "TEAM_FORMATION_CLOSED");
      }
      assert.equal((await students.neha.get(`/teams/${team.id}`)).status, 200);
      assert.equal(
        (await owner.get(`/course-cycles/${cycleId}/teams`)).status,
        200,
      );
      const reopen = await owner.patch(`/course-cycles/${cycleId}`, {
        body: { teamDeadline: at(DAY_MS) },
      });
      assert.equal(reopen.status, 409);
      assert.equal(reopen.body.code, "CYCLE_FIELD_LOCKED");
    });

    it("also arrives when the faculty closes the cycle", async () => {
      const cycleId = await openCycle();
      const team = (await createTeam(cycleId, "aman", ["neha"])).body;
      await owner.post(`/course-cycles/${cycleId}/close`);
      const result = await students.aman.patch(`/teams/${team.id}`, {
        body: { name: "Closed" },
      });
      assert.equal(result.status, 409);
      assert.equal(result.body.code, "TEAM_FORMATION_CLOSED");
    });
  });

  describe("who sees which team", () => {
    it("members see their own team; the owning faculty and admins see all; others see nothing", async () => {
      const cycleId = await openCycle();
      const falcon = (await createTeam(cycleId, "aman", ["neha"])).body;
      await createTeam(cycleId, "ravi", ["priya"]);

      for (const viewer of [owner, admin]) {
        const all = await viewer.get<TeamBody[]>(
          `/course-cycles/${cycleId}/teams`,
        );
        assert.equal(all.status, 200);
        assert.equal(all.body.length, 2);
        assert.equal((await viewer.get(`/teams/${falcon.id}`)).status, 200);
      }
      const ownOnly = await students.ravi.get<TeamBody[]>(
        `/course-cycles/${cycleId}/teams`,
      );
      assert.deepEqual(
        ownOnly.body.map((team) => team.name),
        ["ravi's team"],
      );
      assert.deepEqual(
        (await students.kiran.get(`/course-cycles/${cycleId}/teams`)).body,
        [],
      );

      const hidden: [TestBrowser, string, string][] = [
        [students.ravi, `/teams/${falcon.id}`, "TEAM_NOT_FOUND"],
        [otherFaculty, `/teams/${falcon.id}`, "TEAM_NOT_FOUND"],
        [otherFaculty, `/course-cycles/${cycleId}/teams`, "CYCLE_NOT_FOUND"],
        [students.older, `/course-cycles/${cycleId}/teams`, "CYCLE_NOT_FOUND"],
      ];
      for (const [viewer, path, code] of hidden) {
        const result = await viewer.get(path);
        assert.equal(result.status, 404, path);
        assert.equal(result.body.code, code, path);
      }
      const waiting = await pending.get(`/course-cycles/${cycleId}/teams`);
      assert.equal(waiting.status, 403);
      assert.equal(waiting.body.code, "FACULTY_APPROVAL_PENDING");
    });
  });

  describe("database guarantees", () => {
    it("rejects a second membership in one cycle, a member row in another cycle, and an invalid size range", async () => {
      const cycleA = await openCycle();
      const cycleB = await openCycle();
      const team = (await createTeam(cycleA, "aman", ["neha"])).body;
      const other = (await createTeam(cycleA, "ravi", ["priya"])).body;

      await assert.rejects(
        app.prisma
          .$executeRaw`INSERT INTO "TeamMember" ("teamId", "cycleId", "userId", "addedById") VALUES (${other.id}, ${cycleA}, ${ids.neha}, ${ids.ravi})`,
        /TeamMember_cycleId_userId_key|Unique constraint/,
      );
      await assert.rejects(
        app.prisma
          .$executeRaw`INSERT INTO "TeamMember" ("teamId", "cycleId", "userId", "addedById") VALUES (${team.id}, ${cycleB}, ${ids.kiran}, ${ids.aman})`,
        /TeamMember_teamId_cycleId_fkey|Foreign key constraint/,
      );
      await assert.rejects(
        app.prisma
          .$executeRaw`UPDATE "CourseProjectCycle" SET "minTeamSize" = 5 WHERE "id" = ${cycleA}`,
        /CourseProjectCycle_team_size_check|check constraint/i,
      );
    });
  });
});
