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

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type Student =
  "aman" | "neha" | "ravi" | "priya" | "kiran" | "dev" | "isha" | "older";

const EMAILS: Record<Student, string> = {
  aman: `aman.k26csai${DOMAIN}`,
  neha: `neha.t26csai${DOMAIN}`,
  ravi: `ravi.b26csai${DOMAIN}`,
  priya: `priya.m26csai${DOMAIN}`,
  kiran: `kiran.p26csai${DOMAIN}`,
  dev: `dev.s26csai${DOMAIN}`,
  isha: `isha.r26csai${DOMAIN}`,
  older: `older.r25csai${DOMAIN}`,
};

interface TeamBody {
  id: string;
  name: string;
  leaderId: string;
  origin: string;
  members: { userId: string }[];
  code?: string;
}

interface PreviewBody {
  teams: {
    name: string;
    leader: { id: string };
    members: { id: string }[];
  }[];
  unplaced: { id: string }[];
}

describe("Team completion and electives", () => {
  // Each test builds its cycles relative to this clock and moves it past deadlines.
  const clock = new FixedClock(new Date());
  let app: TestApp;
  let admin: TestBrowser;
  let owner: TestBrowser;
  let otherFaculty: TestBrowser;
  const students = {} as Record<Student, TestBrowser>;
  const ids = {} as Record<Student, string>;
  let ownerId: string;

  before(async () => {
    app = await startTestApp({ clock });
    await app.reset();
    admin = await app.browser().signIn(BOOTSTRAP_ADMIN);
    for (const email of [`vatsala.s${DOMAIN}`, `anil.kr${DOMAIN}`]) {
      await admin.post("/admin/faculty-allowlist", { body: { email } });
    }
    owner = await app.browser().signIn(`vatsala.s${DOMAIN}`);
    ownerId = String((await owner.get("/auth/me")).body.id);
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

  /** Published, batch 2026, 2 to 3 members. Students form teams for an hour, then faculty for another hour. */
  async function openCycle(overrides: Record<string, unknown> = {}) {
    const created = await owner.post("/course-cycles", {
      body: {
        courseName: "Software Design",
        title: "Completion",
        batchYear: 2026,
        semester: 7,
        academicYear: "2026-27",
        minTeamSize: 2,
        maxTeamSize: 3,
        teamDeadline: at(HOUR_MS),
        // Phase 8 (A1): the faculty place students until the idea deadline (was a completion deadline).
        ideaDeadline: at(2 * HOUR_MS),
        milestones: [milestone("Final", at(2 * DAY_MS), at(30 * DAY_MS))],
        ...overrides,
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const cycleId = String(created.body.id);
    // Phase 8: an elective with nobody enrolled cannot be published. These tests start from an
    // empty roster, so a placeholder row stands in for the publish check and is removed again.
    const placeholder = { cycleId, email: `placeholder.z26csai${DOMAIN}` };
    if (overrides.kind === "ELECTIVE") {
      await app.prisma.cycleEnrollment.create({
        data: { ...placeholder, addedById: ownerId },
      });
    }
    const published = await owner.post(`/course-cycles/${cycleId}/publish`);
    assert.equal(published.status, 200, JSON.stringify(published.body));
    if (overrides.kind === "ELECTIVE") {
      await app.prisma.cycleEnrollment.delete({
        where: { cycleId_email: placeholder },
      });
    }
    return cycleId;
  }

  const createTeam = (
    cycleId: string,
    leader: Student,
    members: Student[],
    name = `${leader}'s team`,
  ) =>
    students[leader].post<TeamBody>(`/course-cycles/${cycleId}/teams`, {
      body: { name, memberIds: members.map((member) => ids[member]) },
    });

  const facultyTeam = (
    cycleId: string,
    leader: Student,
    members: Student[],
    name = "Faculty team",
  ) =>
    owner.post<TeamBody>(`/course-cycles/${cycleId}/team-completion/teams`, {
      body: {
        name,
        leaderId: ids[leader],
        memberIds: members.map((member) => ids[member]),
      },
    });

  const sorted = (values: string[]) => [...values].sort();

  describe("electives", () => {
    it("are visible only to enrolled students, whatever their batch", async () => {
      const elective = await openCycle({ kind: "ELECTIVE" });
      const added = await owner.post(`/course-cycles/${elective}/enrollments`, {
        body: { emails: [EMAILS.neha, EMAILS.older] },
      });
      assert.equal(added.status, 201);

      const listed = async (who: Student) =>
        (
          (await students[who].get(`/course-cycles`)).body as unknown as {
            id: string;
          }[]
        ).map((cycle) => cycle.id);
      assert.ok((await listed("neha")).includes(elective));
      assert.ok((await listed("older")).includes(elective));
      assert.ok(!(await listed("ravi")).includes(elective));
      const hidden = await students.ravi.get(`/course-cycles/${elective}`);
      assert.equal(hidden.status, 404);
      assert.equal(hidden.body.code, "CYCLE_NOT_FOUND");
    });

    it("import student emails and report each row they refuse once", async () => {
      const elective = await openCycle({ kind: "ELECTIVE" });
      const result = await owner.post(
        `/course-cycles/${elective}/enrollments`,
        {
          body: {
            emails: [
              ` ${EMAILS.neha.toUpperCase()} `,
              EMAILS.neha,
              `prakriti.p${DOMAIN}`,
              "someone@gmail.com",
              `PRAKRITI.P${DOMAIN}`,
            ],
          },
        },
      );
      assert.deepEqual(result.body, {
        added: [EMAILS.neha],
        alreadyEnrolled: [],
        rejected: [
          {
            email: `prakriti.p${DOMAIN}`,
            reason: "A staff email, not a student",
          },
          {
            email: "someone@gmail.com",
            reason: "Not a student email of this university",
          },
        ],
      });
      const again = await owner.post(`/course-cycles/${elective}/enrollments`, {
        body: { emails: [EMAILS.neha] },
      });
      assert.deepEqual(again.body.alreadyEnrolled, [EMAILS.neha]);
      assert.deepEqual(
        (
          await auditActions(app.prisma, {
            action: "ENROLLMENT_ADDED",
            entityId: elective,
          })
        ).map((row) => row.metadata),
        [{ emails: [EMAILS.neha], registered: [] }],
      );
    });

    it("register who has not signed in yet; the first sign-in claims that account", async () => {
      const elective = await openCycle({ kind: "ELECTIVE" });
      // Batch 2025, so she never joins the batch-2026 core cycles of later tests.
      const newcomer = `zara.q25csai${DOMAIN}`;
      await owner.post(`/course-cycles/${elective}/enrollments`, {
        body: { emails: [EMAILS.neha, newcomer] },
      });
      type Row = {
        email: string;
        userId: string;
        name: string;
        signedIn: boolean;
      };
      const before = await owner.get<Row[]>(
        `/course-cycles/${elective}/enrollments`,
      );
      assert.deepEqual(
        before.body.map((row) => [row.email, row.name, row.signedIn]),
        [
          [EMAILS.neha, "Neha", true],
          [newcomer, "Zara Q", false],
        ],
      );
      const registered = await app.prisma.user.findUniqueOrThrow({
        where: { email: newcomer },
      });
      assert.equal(registered.googleSub, null);
      assert.equal(registered.batchYear, 2025);

      const zara = await app.browser().signIn(newcomer, "Zara");
      assert.equal((await zara.get(`/course-cycles/${elective}`)).status, 200);
      const me = await zara.get("/auth/me");
      assert.equal(me.body.id, before.body[1].userId);
      const afterSignIn = await owner.get<Row[]>(
        `/course-cycles/${elective}/enrollments`,
      );
      assert.deepEqual(
        [afterSignIn.body[1].name, afterSignIn.body[1].signedIn],
        ["Zara", true],
      );
      assert.equal(
        await app.prisma.user.count({ where: { email: newcomer } }),
        1,
      );
      assert.deepEqual(
        (
          await auditActions(app.prisma, {
            action: "USER_CLAIMED",
            entityId: registered.id,
          })
        ).map((row) => row.metadata),
        [{ provider: "dev" }],
      );
    });

    it("form teams and search only within the roster", async () => {
      const elective = await openCycle({ kind: "ELECTIVE" });
      await owner.post(`/course-cycles/${elective}/enrollments`, {
        body: { emails: [EMAILS.aman, EMAILS.neha, EMAILS.older] },
      });
      const outsider = await createTeam(elective, "aman", ["ravi"]);
      assert.equal(outsider.status, 400);
      assert.equal(outsider.body.code, "INELIGIBLE_TEAM_MEMBER");
      // An enrolled student of another batch is a valid teammate in an elective.
      assert.equal((await createTeam(elective, "aman", ["older"])).status, 201);
      const search = await students.neha.get<{ id: string }[]>(
        `/course-cycles/${elective}/team-candidates?q=am`,
      );
      assert.deepEqual(
        search.body.map((candidate) => candidate.id),
        [ids.aman],
      );
    });

    it("never drop a student who is in a team", async () => {
      const elective = await openCycle({ kind: "ELECTIVE" });
      await owner.post(`/course-cycles/${elective}/enrollments`, {
        body: { emails: [EMAILS.aman, EMAILS.neha, EMAILS.ravi] },
      });
      await createTeam(elective, "aman", ["neha"]);
      const remove = (email: string) =>
        owner.delete(
          `/course-cycles/${elective}/enrollments/${encodeURIComponent(email)}`,
        );

      const inTeam = await remove(EMAILS.neha);
      assert.equal(inTeam.status, 409);
      assert.equal(inTeam.body.code, "ENROLLED_STUDENT_IN_TEAM");
      assert.equal((await remove(EMAILS.ravi)).status, 204);
      assert.equal(
        (await remove(EMAILS.ravi)).body.code,
        "ENROLLMENT_NOT_FOUND",
      );
      assert.equal(
        (await students.ravi.get(`/course-cycles/${elective}`)).status,
        404,
      );
    });

    it("are the only cycles with a roster, and stay electives once published", async () => {
      const core = await openCycle();
      const notElective = await owner.post(
        `/course-cycles/${core}/enrollments`,
        { body: { emails: [EMAILS.neha] } },
      );
      assert.equal(notElective.status, 409);
      assert.equal(notElective.body.code, "CYCLE_NOT_ELECTIVE");
      const flip = await owner.patch(`/course-cycles/${core}`, {
        body: { kind: "ELECTIVE" },
      });
      assert.equal(flip.status, 409);
      assert.equal(flip.body.code, "CYCLE_FIELD_LOCKED");
      const foreign = await otherFaculty.get(
        `/course-cycles/${core}/enrollments`,
      );
      assert.equal(foreign.status, 404);
    });
  });

  describe("the placement window (A1)", () => {
    it("runs from the team deadline to the idea deadline, which must come after it", async () => {
      const base = {
        courseName: "Software Design",
        title: "Deadlines",
        batchYear: 2026,
        semester: 7,
        academicYear: "2026-27",
        teamDeadline: at(DAY_MS),
        ideaDeadline: at(DAY_MS),
        milestones: [milestone("Final", at(2 * DAY_MS), at(10 * DAY_MS))],
      };
      // S5 (Phase 9): equal deadlines are allowed and leave no placement window;
      // an idea deadline before the team deadline is refused.
      const equal = await owner.post("/course-cycles", { body: base });
      assert.equal(equal.status, 201, JSON.stringify(equal.body));
      const before = await owner.post("/course-cycles", {
        body: { ...base, ideaDeadline: at(DAY_MS - HOUR_MS) },
      });
      assert.equal(before.status, 400);
      assert.equal(before.body.code, "INVALID_IDEA_DEADLINE");
      // The separate completion deadline is gone (Phase 8).
      const removed = await owner.post("/course-cycles", {
        body: {
          ...base,
          ideaDeadline: at(2 * DAY_MS),
          teamCompletionDeadline: at(2 * DAY_MS),
        },
      });
      assert.equal(removed.status, 400);
      assert.equal(removed.body.code, "VALIDATION_FAILED");

      const created = await owner.post("/course-cycles", {
        body: { ...base, ideaDeadline: at(2 * DAY_MS) },
      });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const cycleId = String(created.body.id);
      await assert.rejects(
        app.prisma
          .$executeRaw`UPDATE "CourseProjectCycle" SET "teamDeadline" = "ideaDeadline" + interval '1 hour' WHERE "id" = ${cycleId}`,
        /CourseProjectCycle_team_idea_deadline_check|check constraint/i,
      );
    });
  });

  describe("looking for a team", () => {
    it("is shown to batch-mates, cleared when the student joins a team, and can be switched off", async () => {
      const cycleId = await openCycle();
      const route = `/course-cycles/${cycleId}/looking-for-team`;
      assert.equal(
        (
          await students.ravi.request("PUT", route, {
            body: { note: "Backend" },
          })
        ).status,
        204,
      );
      await students.priya.request("PUT", route, { body: {} });
      const seekers =
        await students.aman.get<{ name: string; note: string | null }[]>(route);
      assert.deepEqual(
        seekers.body.map((seeker) => [seeker.name, seeker.note]),
        [
          ["Priya", null],
          ["Ravi", "Backend"],
        ],
      );
      const search = await students.aman.get<
        { name: string; lookingForTeam: boolean }[]
      >(`/course-cycles/${cycleId}/team-candidates?q=ravi`);
      assert.equal(search.body[0].lookingForTeam, true);

      await createTeam(cycleId, "aman", ["ravi"]);
      assert.deepEqual(
        (await students.aman.get<{ name: string }[]>(route)).body.map(
          (seeker) => seeker.name,
        ),
        ["Priya"],
      );
      assert.equal((await students.priya.delete(route)).status, 204);
      assert.deepEqual((await students.aman.get(route)).body, []);

      const inTeam = await students.ravi.request("PUT", route, { body: {} });
      assert.equal(inTeam.status, 409);
      assert.equal(inTeam.body.code, "STUDENT_ALREADY_IN_TEAM");
    });
  });

  describe("faculty completing teams", () => {
    it("is possible only from the team deadline until the idea deadline, when students can no longer act", async () => {
      const cycleId = await openCycle();
      const overview = () =>
        owner.get<{ open: boolean }>(
          `/course-cycles/${cycleId}/team-completion`,
        );

      assert.equal((await overview()).body.open, false);
      const early = await facultyTeam(cycleId, "ravi", ["priya"]);
      assert.equal(early.status, 409);
      assert.equal(early.body.code, "TEAM_COMPLETION_CLOSED");

      clock.advance(HOUR_MS);
      assert.equal((await overview()).body.open, true);
      const lateStudent = await createTeam(cycleId, "ravi", ["priya"]);
      assert.equal(lateStudent.body.code, "TEAM_FORMATION_CLOSED");

      clock.advance(HOUR_MS);
      assert.equal((await overview()).body.open, false);
      const late = await owner.post(
        `/course-cycles/${cycleId}/team-completion/auto-group/preview`,
      );
      assert.equal(late.status, 409);
      assert.equal(late.body.code, "TEAM_COMPLETION_CLOSED");
    });

    it("creates teams with a chosen leader and adds students to teams with room", async () => {
      const cycleId = await openCycle();
      const studentTeam = (await createTeam(cycleId, "aman", ["neha"])).body;
      clock.advance(HOUR_MS);

      const created = await facultyTeam(cycleId, "ravi", ["priya"], "Kestrel");
      assert.equal(created.status, 201, JSON.stringify(created.body));
      assert.equal(created.body.leaderId, ids.ravi);
      assert.equal(created.body.origin, "FACULTY");
      const priyasTeams = await students.priya.get<TeamBody[]>("/teams/mine");
      assert.ok(priyasTeams.body.some((team) => team.id === created.body.id));

      const addTo = (teamId: string, who: Student) =>
        owner.post<TeamBody>(`/teams/${teamId}/members`, {
          body: { userId: ids[who] },
        });
      const grown = await addTo(studentTeam.id, "kiran");
      assert.equal(grown.status, 200, JSON.stringify(grown.body));
      assert.deepEqual(
        sorted(grown.body.members.map((member) => member.userId)),
        sorted([ids.aman, ids.neha, ids.kiran]),
      );
      const full = await addTo(studentTeam.id, "dev");
      assert.equal(full.status, 400);
      assert.equal(full.body.code, "TEAM_SIZE_OUT_OF_RANGE");
      const taken = await addTo(created.body.id, "neha");
      assert.equal(taken.body.code, "STUDENT_ALREADY_IN_TEAM");
      const foreign = await otherFaculty.post(
        `/teams/${created.body.id}/members`,
        { body: { userId: ids.dev } },
      );
      assert.equal(foreign.status, 404);

      const remaining = await owner.get<{ unassigned: { id: string }[] }>(
        `/course-cycles/${cycleId}/team-completion`,
      );
      assert.deepEqual(
        sorted(remaining.body.unassigned.map((student) => student.id)),
        sorted([ids.dev, ids.isha]),
      );
    });

    it("auto-groups everyone left into random teams within the size range, on confirmation", async () => {
      const cycleId = await openCycle();
      await createTeam(cycleId, "aman", ["neha"]);
      clock.advance(HOUR_MS);
      const previewRoute = `/course-cycles/${cycleId}/team-completion/auto-group/preview`;

      const preview = (await owner.post<PreviewBody>(previewRoute)).body;
      // Five students left, sizes 2 to 3: a team of 3 and a team of 2.
      assert.deepEqual(
        preview.teams.map((team) => team.members.length + 1).sort(),
        [2, 3],
      );
      assert.deepEqual(
        sorted(
          preview.teams.flatMap((team) => [
            team.leader.id,
            ...team.members.map((member) => member.id),
          ]),
        ),
        sorted([ids.ravi, ids.priya, ids.kiran, ids.dev, ids.isha]),
      );
      assert.equal(
        await app.prisma.team.count({ where: { cycleId } }),
        1,
        "a preview saves nothing",
      );

      const applied = await owner.post<TeamBody[]>(
        `/course-cycles/${cycleId}/team-completion/auto-group`,
        {
          body: {
            teams: preview.teams.map((team) => ({
              name: team.name,
              leaderId: team.leader.id,
              memberIds: team.members.map((member) => member.id),
            })),
          },
        },
      );
      assert.equal(applied.status, 201, JSON.stringify(applied.body));
      assert.deepEqual(
        applied.body.map((team) => team.origin),
        ["AUTO_GROUP", "AUTO_GROUP"],
      );
      const after = await owner.get<{ unassigned: unknown[] }>(
        `/course-cycles/${cycleId}/team-completion`,
      );
      assert.deepEqual(after.body.unassigned, []);
      const [summary] = await auditActions(app.prisma, {
        action: "AUTO_GROUP_APPLIED",
        entityId: cycleId,
      });
      assert.equal(summary.metadata.studentCount, 5);
    });

    it("creates all the confirmed teams or none, if something changed since the preview", async () => {
      const cycleId = await openCycle();
      clock.advance(HOUR_MS);
      const preview = (
        await owner.post<PreviewBody>(
          `/course-cycles/${cycleId}/team-completion/auto-group/preview`,
        )
      ).body;
      assert.ok(preview.teams.length >= 2);
      // Meanwhile the faculty place the second proposed team's students by hand.
      const second = preview.teams[1];
      const byId = Object.fromEntries(
        Object.entries(ids).map(([key, id]) => [id, key as Student]),
      );
      await facultyTeam(
        cycleId,
        byId[second.leader.id],
        second.members.map((member) => byId[member.id]),
        "Placed by hand",
      );

      const stale = await owner.post(
        `/course-cycles/${cycleId}/team-completion/auto-group`,
        {
          body: {
            teams: preview.teams.map((team) => ({
              name: team.name,
              leaderId: team.leader.id,
              memberIds: team.members.map((member) => member.id),
            })),
          },
        },
      );
      assert.equal(stale.status, 409);
      assert.equal(stale.body.code, "STUDENT_ALREADY_IN_TEAM");
      // The first proposed team was valid, yet it was rolled back with the rest.
      assert.equal(
        await app.prisma.team.count({
          where: { cycleId, origin: "AUTO_GROUP" },
        }),
        0,
      );
    });

    it("lets the database settle two confirmations of the same preview", async () => {
      const cycleId = await openCycle();
      clock.advance(HOUR_MS);
      const preview = (
        await owner.post<PreviewBody>(
          `/course-cycles/${cycleId}/team-completion/auto-group/preview`,
        )
      ).body;
      const body = {
        teams: preview.teams.map((team) => ({
          name: team.name,
          leaderId: team.leader.id,
          memberIds: team.members.map((member) => member.id),
        })),
      };
      const route = `/course-cycles/${cycleId}/team-completion/auto-group`;
      const results = await Promise.all([
        owner.post(route, { body }),
        owner.post(route, { body }),
      ]);
      assert.deepEqual(
        results.map((result) => result.status).sort(),
        [201, 409],
      );
      assert.equal(
        await app.prisma.team.count({ where: { cycleId } }),
        preview.teams.length,
      );
    });
  });

  // Batch 2027 belongs to these tests alone, so the batch-2026 counts above never change.
  describe("core batch lists", () => {
    const newcomer = `uma.v27csai${DOMAIN}`;

    it("register the cycle's batch; other batches, staff and unknown rows are refused", async () => {
      const core = await openCycle({ batchYear: 2027 });
      await app.browser().signIn(`lead.l27csai${DOMAIN}`, "Lead");
      const result = await owner.post(`/course-cycles/${core}/batch-students`, {
        body: {
          emails: [
            newcomer,
            `lead.l27csai${DOMAIN}`,
            EMAILS.aman,
            `prakriti.p${DOMAIN}`,
            "someone@gmail.com",
          ],
        },
      });
      assert.equal(result.status, 201, JSON.stringify(result.body));
      assert.deepEqual(result.body, {
        registered: [newcomer],
        alreadyRegistered: [`lead.l27csai${DOMAIN}`],
        rejected: [
          {
            email: EMAILS.aman,
            reason: "A student of batch 2026, not batch 2027",
          },
          {
            email: `prakriti.p${DOMAIN}`,
            reason: "A staff email, not a student",
          },
          {
            email: "someone@gmail.com",
            reason: "Not a student email of this university",
          },
        ],
      });
      const list = await owner.get<
        { email: string; name: string; signedIn: boolean }[]
      >(`/course-cycles/${core}/batch-students`);
      assert.deepEqual(
        list.body.map((row) => [row.email, row.name, row.signedIn]),
        [
          [`lead.l27csai${DOMAIN}`, "Lead", true],
          [newcomer, "Uma V", false],
        ],
      );

      const elective = await openCycle({ kind: "ELECTIVE" });
      const wrongKind = await owner.post(
        `/course-cycles/${elective}/batch-students`,
        { body: { emails: [newcomer] } },
      );
      assert.equal(wrongKind.status, 409);
      assert.equal(wrongKind.body.code, "CYCLE_NOT_CORE");
      assert.equal(
        (await otherFaculty.get(`/course-cycles/${core}/batch-students`))
          .status,
        404,
      );
    });

    it("let leaders find and add a registered student, who then finds the team at first sign-in", async () => {
      const core = await openCycle({ batchYear: 2027 });
      const lead = await app.browser().signIn(`lead.l27csai${DOMAIN}`, "Lead");
      const search = await lead.get<
        { id: string; name: string; signedIn: boolean }[]
      >(`/course-cycles/${core}/team-candidates?q=uma`);
      assert.deepEqual(
        search.body.map((row) => [row.name, row.signedIn]),
        [["Uma V", false]],
      );
      const created = await lead.post<TeamBody>(
        `/course-cycles/${core}/teams`,
        {
          body: { name: "Early birds", memberIds: [search.body[0].id] },
        },
      );
      assert.equal(created.status, 201, JSON.stringify(created.body));

      const uma = await app.browser().signIn(newcomer, "Uma Verma");
      const mine = await uma.get<{ id: string }[]>("/teams/mine");
      assert.deepEqual(
        mine.body.map((entry) => entry.id),
        [created.body.id],
      );
    });
  });
});
