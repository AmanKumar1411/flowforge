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

interface MilestoneBody {
  id: string;
  position: number;
  name: string;
  description: string | null;
  submissionOpensAt: string;
  submissionDueAt: string;
  evaluationAt: string;
  linkRequirement: { required: string[]; optional: string[] };
}

interface CycleBody {
  id: string;
  status: string;
  milestones: MilestoneBody[];
  currentStage: { kind: string };
  warnings?: { code: string }[];
  code?: string;
  details?: { code: string; message: string }[];
}

// Phase 2 scenario, now signing in through dev login; Phase 8 adds milestones, publish checks and audit.
describe("Course cycles", () => {
  const clock = new FixedClock(new Date());
  let app: TestApp;
  let facultyA: TestBrowser;
  let facultyB: TestBrowser;
  let student26: TestBrowser;
  let student25: TestBrowser;

  const at = (offsetMs: number) =>
    new Date(clock.now().getTime() + offsetMs).toISOString();

  /** Teams for a day, ideas for two more, then M1 and M2 back to back and the final one later. */
  const input = (overrides: Record<string, unknown> = {}) => ({
    courseName: "Software Design & System Development",
    title: "2026 Software Development Projects",
    description: "The first project cycle.",
    batchYear: 2026,
    semester: 7,
    academicYear: "2026-27",
    teamDeadline: at(DAY_MS),
    ideaDeadline: at(3 * DAY_MS),
    milestones: [
      milestone("Design review", at(3 * DAY_MS), at(10 * DAY_MS)),
      milestone("Beta", at(10 * DAY_MS), at(20 * DAY_MS)),
      milestone("Final", at(21 * DAY_MS), at(30 * DAY_MS), {
        evaluationAt: at(31 * DAY_MS),
        linkRequirement: { required: ["DRIVE"], optional: [] },
      }),
    ],
    ...overrides,
  });

  before(async () => {
    app = await startTestApp({ clock });
    await app.reset();
    const admin = await app.browser().signIn(BOOTSTRAP_ADMIN);
    for (const email of [`facultya.p${DOMAIN}`, `facultyb.p${DOMAIN}`]) {
      await admin.post("/admin/faculty-allowlist", { body: { email } });
    }
    facultyA = await app.browser().signIn(`facultya.p${DOMAIN}`);
    facultyB = await app.browser().signIn(`facultyb.p${DOMAIN}`);
    student26 = await app.browser().signIn(`studenta.k26csai${DOMAIN}`);
    student25 = await app.browser().signIn(`studentb.k25csai${DOMAIN}`);
  });
  after(() => app.close());

  const ids = (body: unknown) =>
    (body as { id: string }[]).map((cycle) => cycle.id);
  const create = (body: object = input()) =>
    facultyA.post<CycleBody>("/course-cycles", { body });

  it("runs the full lifecycle with ownership and batch visibility", async () => {
    const created = await create();
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const cycleId = created.body.id;
    const mine = await facultyA.get("/course-cycles/my");
    assert.equal(mine.status, 200);
    assert.ok(ids(mine.body).includes(cycleId));

    assert.equal(
      (await facultyA.post(`/course-cycles/${cycleId}/publish`)).status,
      200,
    );
    const visible = await student26.get("/course-cycles");
    assert.equal(visible.status, 200);
    assert.ok(ids(visible.body).includes(cycleId));
    assert.equal(
      (await student26.get(`/course-cycles/${cycleId}`)).status,
      200,
    );

    const otherBatchList = await student25.get("/course-cycles");
    assert.equal(otherBatchList.status, 200);
    assert.ok(!ids(otherBatchList.body).includes(cycleId));
    // Phase 3: a resource the caller may not see is reported as not found (was 403).
    const wrongBatch = await student25.get(`/course-cycles/${cycleId}`);
    assert.equal(wrongBatch.status, 404);
    assert.equal(wrongBatch.body.code, "CYCLE_NOT_FOUND");

    const draft = await create();
    assert.equal(
      (await student26.get(`/course-cycles/${draft.body.id}`)).status,
      404,
    );
    for (const [method, path] of [
      ["PATCH", `/course-cycles/${cycleId}`],
      ["POST", `/course-cycles/${cycleId}/publish`],
      ["POST", `/course-cycles/${cycleId}/close`],
      ["GET", `/course-cycles/${draft.body.id}/publish-checks`],
    ]) {
      const forbidden = await facultyB.request(method, path, {
        body: method === "PATCH" ? { title: "No access" } : undefined,
      });
      assert.equal(forbidden.status, 404, `${method} ${path}`);
      assert.equal(forbidden.body.code, "CYCLE_NOT_FOUND");
    }

    assert.equal(
      (await facultyA.post(`/course-cycles/${cycleId}/close`)).status,
      200,
    );
    const closedEdit = await facultyA.patch(`/course-cycles/${cycleId}`, {
      body: { description: "No" },
    });
    assert.equal(closedEdit.status, 409);
    assert.equal(closedEdit.body.code, "CYCLE_ALREADY_CLOSED");
    assert.equal(
      (await facultyA.post(`/course-cycles/${cycleId}/publish`)).status,
      409,
    );
    assert.equal(
      (await facultyA.post(`/course-cycles/${cycleId}/close`)).status,
      409,
    );
  });

  it("lets exactly one of two concurrent publishes win", async () => {
    const draft = await create();
    const id = draft.body.id;
    const race = await Promise.all([
      facultyA.post(`/course-cycles/${id}/publish`),
      facultyA.post(`/course-cycles/${id}/publish`),
    ]);
    assert.deepEqual(race.map((result) => result.status).sort(), [200, 409]);
  });

  it("keeps the { code, message } shape for validation errors", async () => {
    const invalid = await create(input({ academicYear: "2026-28" }));
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.code, "INVALID_ACADEMIC_YEAR");
    const unknownField = await create(input({ status: "PUBLISHED" }));
    assert.equal(unknownField.status, 400);
    assert.equal(unknownField.body.code, "VALIDATION_FAILED");
  });

  describe("milestones (Phase 8)", () => {
    it("saves three milestones with the cycle in one request", async () => {
      const created = await create();
      assert.equal(created.status, 201, JSON.stringify(created.body));
      assert.deepEqual(
        created.body.milestones.map((m) => [
          m.position,
          m.name,
          m.linkRequirement.required,
        ]),
        [
          [1, "Design review", ["GITHUB"]],
          [2, "Beta", ["GITHUB"]],
          [3, "Final", ["DRIVE"]],
        ],
      );
      assert.equal(
        await app.prisma.milestone.count({
          where: { cycleId: created.body.id },
        }),
        3,
      );
    });

    it("saves nothing when the schedule is out of order", async () => {
      const before = await app.prisma.courseProjectCycle.count();
      const milestonesBefore = await app.prisma.milestone.count();
      const overlapping = await create(
        input({
          milestones: [
            milestone("Design review", at(3 * DAY_MS), at(10 * DAY_MS)),
            milestone("Beta", at(9 * DAY_MS), at(20 * DAY_MS)),
          ],
        }),
      );
      assert.equal(overlapping.status, 400);
      assert.equal(overlapping.body.code, "INVALID_MILESTONE_SCHEDULE");
      const duplicate = await create(
        input({
          milestones: [
            milestone("Final", at(3 * DAY_MS), at(10 * DAY_MS)),
            milestone("final", at(10 * DAY_MS), at(20 * DAY_MS)),
          ],
        }),
      );
      assert.equal(duplicate.body.code, "DUPLICATE_MILESTONE_NAME");
      const eleven = await create(
        input({
          milestones: Array.from({ length: 11 }, (_, index) =>
            milestone(
              `M${index + 1}`,
              at((3 + index) * DAY_MS),
              at((4 + index) * DAY_MS),
            ),
          ),
        }),
      );
      assert.equal(eleven.body.code, "INVALID_MILESTONE_COUNT");
      assert.equal(await app.prisma.courseProjectCycle.count(), before);
      assert.equal(await app.prisma.milestone.count(), milestonesBefore);
      await assert.rejects(
        app.prisma.$executeRaw`
          INSERT INTO "Milestone" ("id", "cycleId", "position", "name", "submissionOpensAt", "submissionDueAt", "evaluationAt", "linkRequirement", "updatedAt")
          SELECT gen_random_uuid(), "id", 9, 'Backwards', now(), now() - interval '1 day', now(), '{}', now() FROM "CourseProjectCycle" LIMIT 1`,
        /Milestone_window_check/,
      );
    });

    it("keeps milestone ids through a draft's edits, and saves a bad edit not at all", async () => {
      const created = await create();
      const [design, beta, final] = created.body.milestones;
      const reordered = await facultyA.patch<CycleBody>(
        `/course-cycles/${created.body.id}`,
        {
          body: {
            title: "Renamed",
            milestones: [
              { ...milestone("Kick-off", at(3 * DAY_MS), at(5 * DAY_MS)) },
              {
                id: beta.id,
                ...milestone("Beta", at(5 * DAY_MS), at(20 * DAY_MS)),
              },
              {
                id: final.id,
                ...milestone("Final", at(21 * DAY_MS), at(30 * DAY_MS)),
              },
            ],
          },
        },
      );
      assert.equal(reordered.status, 200, JSON.stringify(reordered.body));
      assert.deepEqual(
        reordered.body.milestones.map((m) => [m.position, m.name]),
        [
          [1, "Kick-off"],
          [2, "Beta"],
          [3, "Final"],
        ],
      );
      assert.equal(reordered.body.milestones[1].id, beta.id);
      // Left out: removed. The final milestone kept its Drive requirement.
      assert.ok(!reordered.body.milestones.some((m) => m.id === design.id));
      assert.deepEqual(reordered.body.milestones[2].linkRequirement.required, [
        "DRIVE",
      ]);

      const broken = await facultyA.patch(`/course-cycles/${created.body.id}`, {
        body: {
          title: "Should not stick",
          milestones: [
            { id: beta.id, ...milestone("Beta", at(DAY_MS), at(20 * DAY_MS)) },
          ],
        },
      });
      assert.equal(broken.status, 400);
      const stored = await facultyA.get<CycleBody & { title: string }>(
        `/course-cycles/${created.body.id}`,
      );
      assert.equal(stored.body.title, "Renamed");
      assert.equal(stored.body.milestones.length, 3);
    });

    it("after publishing, moves only a milestone that has not opened, and never adds or removes one (A3)", async () => {
      const created = await create();
      const cycleId = created.body.id;
      await facultyA.post(`/course-cycles/${cycleId}/publish`);
      const keep = (m: MilestoneBody) => ({
        id: m.id,
        name: m.name,
        submissionOpensAt: m.submissionOpensAt,
        submissionDueAt: m.submissionDueAt,
        evaluationAt: m.evaluationAt,
      });
      const [m1, m2, m3] = created.body.milestones;
      clock.advance(4 * DAY_MS); // M1 is open, M2 and M3 are not.
      const patch = (milestones: object[]) =>
        facultyA.patch<CycleBody>(`/course-cycles/${cycleId}`, {
          body: { milestones },
        });

      const moved = await patch([
        keep(m1),
        keep(m2),
        // The clock moved 4 days: day 25 from now is day 29 of the plan, before M3's evaluation on day 31.
        {
          ...keep(m3),
          submissionDueAt: at(25 * DAY_MS),
          description: "Bring the deck",
        },
      ]);
      assert.equal(moved.status, 200, JSON.stringify(moved.body));
      assert.equal(moved.body.milestones[2].description, "Bring the deck");

      const opened = await patch([
        { ...keep(m1), submissionDueAt: at(7 * DAY_MS) },
        keep(m2),
        keep(moved.body.milestones[2]),
      ]);
      assert.equal(opened.status, 409);
      assert.equal(opened.body.code, "MILESTONE_LOCKED");
      const past = await patch([
        keep(m1),
        { ...keep(m2), submissionOpensAt: at(-HOUR_MS) },
        keep(moved.body.milestones[2]),
      ]);
      assert.equal(past.body.code, "INVALID_MILESTONE_SCHEDULE");
      const removed = await patch([keep(m1), keep(m2)]);
      assert.equal(removed.status, 409);
      assert.equal(removed.body.code, "MILESTONES_LOCKED");
      const added = await patch([
        keep(m1),
        keep(m2),
        keep(moved.body.milestones[2]),
        milestone("Extra", at(40 * DAY_MS), at(41 * DAY_MS)),
      ]);
      assert.equal(added.body.code, "MILESTONES_LOCKED");
    });
  });

  describe("publish checks (Phase 8)", () => {
    it("reports every problem at once: no milestones, no students, an empty idea list", async () => {
      const elective = await create(
        input({ kind: "ELECTIVE", ideaSource: "FACULTY_LIST", milestones: [] }),
      );
      const preview = await facultyA.get<{ blocking: { code: string }[] }>(
        `/course-cycles/${elective.body.id}/publish-checks`,
      );
      assert.equal(preview.status, 200);
      const blocked = await facultyA.post<CycleBody>(
        `/course-cycles/${elective.body.id}/publish`,
      );
      assert.equal(blocked.status, 409);
      assert.equal(blocked.body.code, "PUBLISH_BLOCKED");
      const codes = ["NO_MILESTONES", "ROSTER_EMPTY", "IDEA_LIST_EMPTY"];
      assert.deepEqual(
        blocked.body.details?.map((detail) => detail.code),
        codes,
      );
      assert.deepEqual(
        preview.body.blocking.map((detail) => detail.code),
        codes,
      );
      assert.ok(
        blocked.body.details?.every((detail) => detail.message.length > 0),
      );
      const stillDraft = await facultyA.get<CycleBody>(
        `/course-cycles/${elective.body.id}`,
      );
      assert.equal(stillDraft.body.status, "DRAFT");
    });

    it("publishes a core course without students, with a warning", async () => {
      // Nobody of batch 2030 has signed in or been registered.
      const core = await create(
        input({ batchYear: 2030, academicYear: "2026-27" }),
      );
      const published = await facultyA.post<CycleBody>(
        `/course-cycles/${core.body.id}/publish`,
      );
      assert.equal(published.status, 200, JSON.stringify(published.body));
      assert.deepEqual(
        published.body.warnings?.map((warning) => warning.code),
        ["NO_STUDENTS_YET"],
      );
      assert.equal(published.body.currentStage.kind, "TEAMS");
    });
  });

  describe("audit (Phase 8)", () => {
    it("records creating, editing, publishing and closing, each with the change", async () => {
      const created = await create();
      const cycleId = created.body.id;
      await facultyA.patch(`/course-cycles/${cycleId}`, {
        body: { description: "Edited" },
      });
      await facultyA.post(`/course-cycles/${cycleId}/publish`);
      await facultyA.post(`/course-cycles/${cycleId}/close`);
      const rows = await auditActions(app.prisma, { entityId: cycleId });
      assert.deepEqual(
        rows.map((row) => row.action),
        ["CYCLE_CREATED", "CYCLE_UPDATED", "CYCLE_PUBLISHED", "CYCLE_CLOSED"],
      );
      assert.deepEqual(rows[1].metadata.fields, ["description"]);
    });

    it("rolls the change back when its audit row cannot be written", async () => {
      const created = await create();
      const cycleId = created.body.id;
      await app.prisma.$executeRawUnsafe(`
        CREATE FUNCTION phase8_fail_cycle_audit() RETURNS trigger AS $$
        BEGIN
          IF NEW."action" = 'CYCLE_UPDATED' THEN RAISE EXCEPTION 'forced audit failure'; END IF;
          RETURN NEW;
        END $$ LANGUAGE plpgsql`);
      await app.prisma.$executeRawUnsafe(`
        CREATE TRIGGER phase8_fail_cycle_audit BEFORE INSERT ON "AuditLog"
        FOR EACH ROW EXECUTE FUNCTION phase8_fail_cycle_audit()`);
      try {
        const failed = await facultyA.patch(`/course-cycles/${cycleId}`, {
          body: {
            title: "Never saved",
            milestones: [
              milestone("Only one", at(3 * DAY_MS), at(10 * DAY_MS)),
            ],
          },
        });
        assert.equal(failed.status, 500);
      } finally {
        await app.prisma.$executeRawUnsafe(
          `DROP TRIGGER phase8_fail_cycle_audit ON "AuditLog"`,
        );
        await app.prisma.$executeRawUnsafe(
          `DROP FUNCTION phase8_fail_cycle_audit()`,
        );
      }
      const stored = await facultyA.get<CycleBody & { title: string }>(
        `/course-cycles/${cycleId}`,
      );
      assert.equal(stored.body.title, "2026 Software Development Projects");
      assert.equal(stored.body.milestones.length, 3);
      assert.deepEqual(
        (await auditActions(app.prisma, { entityId: cycleId })).map(
          (row) => row.action,
        ),
        ["CYCLE_CREATED"],
      );
    });
  });
});
