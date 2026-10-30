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

interface GradingBody {
  maxMarks: number | null;
  releasedAt: string | null;
  open: boolean;
  rows: {
    team: { id: string; name: string };
    evaluation: {
      marks: number | null;
      feedback: string | null;
      version: number;
    } | null;
    latestWork: { version: number } | null;
  }[];
  code?: string;
}
interface EvaluationBody {
  marks: number | null;
  maxMarks: number | null;
  feedback: string | null;
  releasedAt: string | null;
  updatedAfterRelease: boolean;
  code?: string;
}

// Phase 9: private evaluations per milestone (ADR 020).
describe("Evaluations", () => {
  const clock = new FixedClock(new Date());
  let app: TestApp;
  let owner: TestBrowser;
  let otherFaculty: TestBrowser;
  let admin: TestBrowser;
  let pending: TestBrowser;
  const s = {} as Record<
    "aman" | "neha" | "ravi" | "kiran" | "older",
    TestBrowser
  >;
  const ids = {} as Record<keyof typeof s, string>;
  let cycleId = "";
  let m1 = "";
  let m2 = "";
  let falcon = "";
  let kestrel = "";

  const at = (offset: number) =>
    new Date(clock.now().getTime() + offset).toISOString();
  const base = () => `/course-cycles/${cycleId}/milestones/${m1}`;
  const save = (
    who: TestBrowser,
    teamId: string,
    body: object,
    milestoneId = m1,
  ) =>
    who.put<EvaluationBody>(
      `/course-cycles/${cycleId}/milestones/${milestoneId}/teams/${teamId}/evaluation`,
      { body },
    );
  const read = (who: TestBrowser, teamId: string, milestoneId = m1) =>
    who.get<EvaluationBody[]>(
      `/course-cycles/${cycleId}/milestones/${milestoneId}/teams/${teamId}/evaluations`,
    );
  const grading = (who: TestBrowser) =>
    who.get<GradingBody>(`${base()}/grading`);

  before(async () => {
    app = await startTestApp({ clock });
    await app.reset();
    admin = await app.browser().signIn(BOOTSTRAP_ADMIN);
    for (const email of [`vatsala.s${DOMAIN}`, `anil.kr${DOMAIN}`]) {
      await admin.post("/admin/faculty-allowlist", { body: { email } });
    }
    owner = await app.browser().signIn(`vatsala.s${DOMAIN}`);
    otherFaculty = await app.browser().signIn(`anil.kr${DOMAIN}`);
    pending = await app.browser().signIn(`sahil.a${DOMAIN}`);
    for (const [key, email] of [
      ["aman", `aman.k26csai${DOMAIN}`],
      ["neha", `neha.t26csai${DOMAIN}`],
      ["ravi", `ravi.b26csai${DOMAIN}`],
      ["kiran", `kiran.p26csai${DOMAIN}`],
      ["older", `older.r25csai${DOMAIN}`],
    ] as const) {
      s[key] = await app.browser().signIn(email, key);
      ids[key] = String((await s[key].get("/auth/me")).body.id);
    }
    const created = await owner.post<{
      id: string;
      milestones: { id: string }[];
    }>("/course-cycles", {
      body: {
        courseName: "Software Design",
        title: "Graded",
        batchYear: 2026,
        semester: 7,
        academicYear: "2026-27",
        minTeamSize: 1,
        maxTeamSize: 3,
        teamDeadline: at(HOUR_MS),
        ideaDeadline: at(2 * HOUR_MS),
        milestones: [
          milestone("Design review", at(3 * HOUR_MS), at(DAY_MS)),
          milestone("Final", at(DAY_MS), at(10 * DAY_MS)),
        ],
      },
    });
    cycleId = created.body.id;
    [m1, m2] = created.body.milestones.map((m) => m.id);
    assert.equal(
      (await owner.post(`/course-cycles/${cycleId}/publish`)).status,
      200,
    );
    falcon = String(
      (
        await s.aman.post<{ id: string }>(`/course-cycles/${cycleId}/teams`, {
          body: { name: "Falcon", memberIds: [ids.neha] },
        })
      ).body.id,
    );
    kestrel = String(
      (
        await s.ravi.post<{ id: string }>(`/course-cycles/${cycleId}/teams`, {
          body: { name: "Kestrel", memberIds: [] },
        })
      ).body.id,
    );
    // Falcon gets its idea approved and submits M1; Kestrel submits nothing.
    const idea = await s.aman.put<{ version: number }>(
      `/teams/${falcon}/idea`,
      {
        body: {
          title: "Lost and found",
          problem: "Things get lost",
          solution: "A board",
        },
      },
    );
    await owner.post(`/teams/${falcon}/idea/review`, {
      body: { version: idea.body.version, decision: "APPROVED" },
    });
    clock.advance(3 * HOUR_MS);
    assert.equal(
      (
        await s.neha.post(`/teams/${falcon}/milestones/${m1}/submissions`, {
          body: {
            links: [{ type: "GITHUB", url: "https://github.com/falcon/app" }],
          },
        })
      ).status,
      201,
    );
  });
  after(() => app.close());

  it("opens at the due date; the scale comes first and never drops below a mark", async () => {
    const early = await save(owner, falcon, { feedback: "Too early" });
    assert.equal(early.status, 409);
    assert.equal(early.body.code, "GRADING_NOT_OPEN");
    clock.advance(DAY_MS); // M1 is due; M2 is open.
    const noScale = await save(owner, falcon, { marks: 10 });
    assert.equal(noScale.body.code, "MAX_MARKS_NOT_SET");
    assert.equal(
      (
        await owner.put<GradingBody>(`${base()}/grading`, {
          body: { maxMarks: 20 },
        })
      ).status,
      200,
    );
    const view = (await grading(owner)).body;
    assert.equal(view.open, true);
    const rows = new Map(view.rows.map((row) => [row.team.name, row]));
    assert.equal(rows.get("Falcon")?.latestWork?.version, 1);
    assert.equal(
      rows.get("Kestrel")?.latestWork,
      null,
      "a team without a submission is listed, flagged by null",
    );

    assert.equal(
      (await save(owner, falcon, { marks: 18, feedback: "Solid design" }))
        .status,
      200,
    );
    const lower = await owner.put<GradingBody>(`${base()}/grading`, {
      body: { maxMarks: 15 },
    });
    assert.equal(lower.status, 409);
    assert.equal(lower.body.code, "MAX_MARKS_BELOW_EXISTING");
    assert.equal(
      (await save(owner, kestrel, { marks: 21 })).body.code,
      "INVALID_MARKS",
    );
    assert.equal(
      (await save(owner, kestrel, {})).body.code,
      "EMPTY_EVALUATION",
    );
  });

  it("refuses a save based on an old version, and lets one of two concurrent first saves win", async () => {
    const stale = await save(owner, falcon, { marks: 17 });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, "EVALUATION_CHANGED");
    const race = await Promise.all([
      save(owner, kestrel, { feedback: "First" }),
      save(owner, kestrel, { feedback: "Second" }),
    ]);
    assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
    assert.equal(
      race.find((r) => r.status === 409)?.body.code,
      "EVALUATION_CHANGED",
    );
    const rows = (await grading(owner)).body.rows;
    assert.equal(
      rows.find((row) => row.team.id === kestrel)?.evaluation?.version,
      1,
    );
  });

  it("hides everything until release, then shows each team only its own result, all teams at once", async () => {
    const before = await read(s.aman, falcon);
    assert.equal(before.status, 200);
    assert.deepEqual(before.body, [], "own team before release: an empty list");
    const released = await owner.post<GradingBody>(`${base()}/grading/release`);
    assert.equal(released.status, 200);
    assert.ok(released.body.releasedAt);
    assert.equal(
      (await owner.post(`${base()}/grading/release`)).body.code,
      "ALREADY_RELEASED",
    );

    const [mine, theirs] = await Promise.all([
      read(s.neha, falcon),
      read(s.ravi, kestrel),
    ]);
    assert.deepEqual(
      [mine.body[0].marks, mine.body[0].maxMarks, mine.body[0].feedback],
      [18, 20, "Solid design"],
    );
    assert.equal(mine.body[0].updatedAfterRelease, false);
    assert.equal(theirs.body[0].feedback, "First");
    // Release needs a graded team: M2 has none.
    clock.advance(10 * DAY_MS);
    const empty = await owner.post(
      `/course-cycles/${cycleId}/milestones/${m2}/grading/release`,
    );
    assert.equal(empty.body.code, "NOTHING_TO_RELEASE");
  });

  it("keeps every version: a correction after release shows as updated; late grading is visible at once", async () => {
    const current = (await grading(owner)).body.rows.find(
      (row) => row.team.id === falcon,
    )!.evaluation!;
    const corrected = await save(owner, falcon, {
      marks: 19,
      feedback: "Solid design",
      expectedVersion: current.version,
    });
    assert.equal(corrected.status, 200);
    const seen = (await read(s.aman, falcon)).body[0];
    assert.deepEqual([seen.marks, seen.updatedAfterRelease], [19, true]);
    const evaluation = await app.prisma.evaluation.findUniqueOrThrow({
      where: { milestoneId_teamId: { milestoneId: m1, teamId: falcon } },
      include: { revisions: { orderBy: { version: "asc" } } },
    });
    assert.deepEqual(
      evaluation.revisions.map((r) => [r.version, Number(r.marks)]),
      [
        [1, 18],
        [2, 19],
      ],
    );
    await assert.rejects(
      app.prisma
        .$executeRaw`UPDATE "EvaluationRevision" SET "feedback" = 'x' WHERE "evaluationId" = ${evaluation.id}`,
      /append-only/,
    );
    const actions = (await auditActions(app.prisma)).map((row) => row.action);
    assert.ok(
      actions.includes("EVALUATION_SAVED") &&
        actions.includes("EVALUATION_RELEASED") &&
        actions.includes("GRADING_SCALE_SET"),
    );
  });

  it("is private: members read their own team only; strangers get 404, never a hint", async () => {
    const team = (who: TestBrowser, teamId: string) =>
      read(who, teamId).then((r) => r.status);
    const cases: [string, TestBrowser, string, number][] = [
      ["own member", s.neha, falcon, 200],
      ["a member of another team", s.ravi, falcon, 404],
      ["a batch-mate without a team", s.kiran, falcon, 404],
      ["a student of another batch", s.older, falcon, 404],
      ["the owner", owner, falcon, 200],
      ["another faculty member", otherFaculty, falcon, 404],
      ["an admin", admin, falcon, 200],
      ["pending staff", pending, falcon, 403],
    ];
    for (const [who, browser, teamId, status] of cases) {
      assert.equal(
        await team(browser, teamId),
        status,
        `${who}: team evaluations`,
      );
    }
    for (const [who, browser, status] of [
      ["a student", s.aman, 404],
      ["another faculty member", otherFaculty, 404],
      ["an admin", admin, 200],
      ["the owner", owner, 200],
    ] as const) {
      assert.equal((await grading(browser)).status, status, `${who}: grading`);
    }
    // Writes are the owner's: other faculty see nothing; other roles are refused by role.
    assert.equal(
      (await save(otherFaculty, falcon, { feedback: "x" })).status,
      404,
    );
    assert.equal((await save(admin, falcon, { feedback: "x" })).status, 403);
    assert.equal((await save(s.aman, falcon, { feedback: "x" })).status, 403);
    assert.equal(
      (await otherFaculty.post(`${base()}/grading/release`)).status,
      404,
    );
    // A milestone of another cycle or a team of another cycle: not found.
    const missing = "00000000-0000-4000-8000-000000000000";
    assert.equal((await read(owner, missing)).status, 404);
    assert.equal(
      (
        await owner.get(
          `/course-cycles/${cycleId}/milestones/${missing}/grading`,
        )
      ).status,
      404,
    );
  });

  it("rolls the save back when its audit row cannot be written", async () => {
    await app.prisma.$executeRawUnsafe(`
      CREATE FUNCTION phase9_fail_evaluation_audit() RETURNS trigger AS $$
      BEGIN
        IF NEW."action" = 'EVALUATION_SAVED' THEN RAISE EXCEPTION 'forced audit failure'; END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql`);
    await app.prisma.$executeRawUnsafe(`
      CREATE TRIGGER phase9_fail_evaluation_audit BEFORE INSERT ON "AuditLog"
      FOR EACH ROW EXECUTE FUNCTION phase9_fail_evaluation_audit()`);
    try {
      const failed = await save(owner, kestrel, {
        feedback: "Never saved",
        expectedVersion: 1,
      });
      assert.equal(failed.status, 500);
    } finally {
      await app.prisma.$executeRawUnsafe(
        `DROP TRIGGER phase9_fail_evaluation_audit ON "AuditLog"`,
      );
      await app.prisma.$executeRawUnsafe(
        `DROP FUNCTION phase9_fail_evaluation_audit()`,
      );
    }
    const kept = await app.prisma.evaluation.findUniqueOrThrow({
      where: { milestoneId_teamId: { milestoneId: m1, teamId: kestrel } },
      include: { revisions: true },
    });
    assert.deepEqual(
      [kept.version, kept.feedback, kept.revisions.length],
      [1, "First", 1],
    );
  });
});
