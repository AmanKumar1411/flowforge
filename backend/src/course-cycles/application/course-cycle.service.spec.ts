import { AuditService } from "../../audit/audit.service";
import { AuditEvent } from "../../audit/domain/audit-event";
import { FixedClock } from "../../common/testing/fixed-clock";
import { ImmediateTransactionRunner } from "../../common/testing/immediate-transaction.runner";
import { UsersService } from "../../users/users.service";
import { CycleDomainError } from "../domain/cycle.errors";
import { CycleTimeline } from "../domain/cycle-timeline";
import { CycleWorkflow } from "../domain/cycle-workflow";
import {
  CycleActor,
  CycleAuthorizationPolicy,
} from "../domain/cycle-authorization-policy";
import { InMemoryCycleRepository } from "../testing/in-memory-cycle.repository";
import { CreateCycleDto } from "../presentation/dto/create-cycle.dto";
import { MilestoneDto } from "../presentation/dto/milestone.dto";
import { CourseCycleService } from "./course-cycle.service";
import { CyclePublishChecks } from "./cycle-publish-checks";
import { PublishChecks } from "./publish-checks";

// Jest cannot load NestJS 12's ES modules on Node 22; stub the decorators the classes use.
// Nested DTOs use class-transformer's @Type, which needs reflect-metadata at load time.
jest.mock("class-transformer", () => ({ Type: () => () => undefined }));
jest.mock("@nestjs/common", () => ({
  Injectable: () => (target: unknown) => target,
}));
jest.mock("@nestjs/swagger", () => ({
  ApiProperty: () => () => undefined,
  ApiPropertyOptional: () => () => undefined,
}));

const faculty = (id: string): CycleActor => ({
  id,
  role: "FACULTY",
  batchYear: null,
  email: `${id}@nst.rishihood.edu.in`,
});
const student = (id: string, batchYear: number | null): CycleActor => ({
  id,
  role: "STUDENT",
  batchYear,
  email: `${id}@nst.rishihood.edu.in`,
});
const admin: CycleActor = {
  id: "admin",
  role: "ADMIN",
  batchYear: null,
  email: "coordinator.x@nst.rishihood.edu.in",
};
const pendingStaff: CycleActor = {
  id: "pending",
  role: "PENDING_STAFF",
  batchYear: null,
  email: "sahil.a@nst.rishihood.edu.in",
};

// Now is 23 Oct 2026, 09:00 UTC; the plan runs through November.
const NOW = "2026-10-23T09:00:00.000Z";
const nov = (day: number, hour = 12) =>
  new Date(Date.UTC(2026, 10, day, hour)).toISOString();

const milestone = (
  name: string,
  opens: number,
  due: number,
  evaluation = due,
): MilestoneDto => ({
  name,
  submissionOpensAt: nov(opens),
  submissionDueAt: nov(due),
  evaluationAt: nov(evaluation),
});

// Phase 8: team and idea deadlines plus milestones replace the single submission window.
const createDto = (
  batchYear = 2026,
  overrides: Partial<CreateCycleDto> = {},
): CreateCycleDto => ({
  courseName: "Software Design",
  title: "Software Development Projects",
  description: "Build and ship a useful system.",
  batchYear,
  semester: 7,
  academicYear: "2026-27",
  teamDeadline: nov(4),
  ideaDeadline: nov(8),
  milestones: [
    milestone("Design review", 8, 15, 16),
    milestone("Final", 16, 30),
  ],
  ...overrides,
});

describe("CourseCycleService", () => {
  let service: CourseCycleService;
  let clock: FixedClock;
  let audited: AuditEvent[];
  let batchStudents: unknown[];
  beforeEach(() => {
    clock = new FixedClock(NOW);
    audited = [];
    batchStudents = [{ id: "s1" }];
    const repository = new InMemoryCycleRepository();
    const workflow = new CycleWorkflow();
    const checks = new PublishChecks();
    new CyclePublishChecks(checks, workflow, repository, {
      listActiveStudents: async () => batchStudents,
    } as unknown as UsersService).onModuleInit();
    service = new CourseCycleService(
      repository,
      workflow,
      new CycleAuthorizationPolicy(),
      checks,
      new CycleTimeline(clock),
      {
        record: async (_tx: unknown, event: AuditEvent) => {
          audited.push(event);
        },
      } as unknown as AuditService,
      new ImmediateTransactionRunner(),
      clock,
    );
  });
  const owner = faculty("faculty-a");
  const otherFaculty = faculty("faculty-b");

  it("creates a cycle with its milestones, publishes, closes, and audits each step", async () => {
    const created = await service.create(owner, createDto());
    expect(created.status).toBe("DRAFT");
    expect(created.milestones.map((m) => [m.position, m.name])).toEqual([
      [1, "Design review"],
      [2, "Final"],
    ]);
    expect(created.milestones[0].linkRequirement).toEqual({
      required: ["GITHUB"],
      optional: ["DEMO", "REPORT"],
    });
    expect(created.ideaSource).toBe("BOTH");
    expect(created.ideaLinkRequirement).toEqual({
      required: [],
      optional: ["GITHUB", "DRIVE"],
    });
    expect(created.currentStage).toEqual({ kind: "DRAFT" });

    const edited = await service.update(owner, created.id, {
      description: "Updated description",
    });
    expect(edited.description).toBe("Updated description");
    const published = await service.publish(owner, created.id);
    expect(published.status).toBe("PUBLISHED");
    expect(published.warnings).toEqual([]);
    expect(published.currentStage).toEqual({ kind: "TEAMS" });
    expect(published.nextEvents.map((event) => event.kind)).toEqual([
      "TEAM_DEADLINE",
      "IDEA_DEADLINE",
      "SUBMISSION_OPENS",
    ]);
    await expect(
      service.update(owner, created.id, { title: "Locked" }),
    ).rejects.toMatchObject({ code: "CYCLE_FIELD_LOCKED" });
    const closed = await service.close(owner, created.id);
    expect(closed.status).toBe("CLOSED");
    await expect(
      service.update(owner, created.id, { description: "No" }),
    ).rejects.toMatchObject({ code: "CYCLE_ALREADY_CLOSED" });
    expect(audited.map((event) => event.action)).toEqual([
      "CYCLE_CREATED",
      "CYCLE_UPDATED",
      "CYCLE_PUBLISHED",
      "CYCLE_CLOSED",
    ]);
    expect(audited[1].metadata).toMatchObject({ fields: ["description"] });
  });

  it("refuses a schedule out of order before saving anything", async () => {
    await expect(
      service.create(owner, createDto(2026, { ideaDeadline: nov(4) })),
    ).rejects.toMatchObject({ code: "INVALID_IDEA_DEADLINE" });
    await expect(
      service.create(
        owner,
        createDto(2026, { milestones: [milestone("A", 6, 10)] }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_MILESTONE_SCHEDULE" });
    expect(await service.listMine(owner)).toEqual([]);
    expect(audited).toEqual([]);
  });

  it("keeps milestone ids when a draft's list is reordered or edited, and removes the ones left out", async () => {
    const created = await service.create(owner, createDto());
    const [design, final] = created.milestones;
    const updated = await service.update(owner, created.id, {
      milestones: [
        { ...milestone("Kick-off", 8, 10), id: undefined },
        { ...milestone("Final", 10, 30), id: final.id },
      ],
    });
    expect(updated.milestones.map((m) => [m.position, m.name])).toEqual([
      [1, "Kick-off"],
      [2, "Final"],
    ]);
    expect(updated.milestones[1].id).toBe(final.id);
    expect(updated.milestones.some((m) => m.id === design.id)).toBe(false);
    await expect(
      service.update(owner, created.id, {
        milestones: [{ ...milestone("Ghost", 8, 10), id: design.id }],
      }),
    ).rejects.toMatchObject({ code: "MILESTONE_NOT_FOUND" });
  });

  it("after publishing, moves only a milestone that has not opened (A3)", async () => {
    const created = await service.create(owner, createDto());
    await service.publish(owner, created.id);
    const [design, final] = created.milestones;
    const keep = (m: typeof design) => ({ ...m, linkRequirement: undefined });
    clock.advance(Date.parse(nov(10)) - Date.parse(NOW));
    const moved = await service.update(owner, created.id, {
      milestones: [
        keep(design),
        { ...keep(final), submissionDueAt: nov(29), evaluationAt: nov(29) },
      ],
    });
    expect(moved.milestones[1].submissionDueAt).toBe(nov(29));
    await expect(
      service.update(owner, created.id, {
        milestones: [
          { ...keep(design), submissionDueAt: nov(15, 18) },
          keep(final),
        ],
      }),
    ).rejects.toMatchObject({ code: "MILESTONE_LOCKED" });
    await expect(
      service.update(owner, created.id, { milestones: [keep(design)] }),
    ).rejects.toMatchObject({ code: "MILESTONES_LOCKED" });
    await expect(
      service.update(owner, created.id, { ideaSource: "FACULTY_LIST" }),
    ).rejects.toMatchObject({ code: "CYCLE_FIELD_LOCKED" });
  });

  it("reports every publish problem at once, and publishes a core course without students with a warning", async () => {
    const elective = await service
      .create(
        owner,
        createDto(2026, {
          kind: "ELECTIVE",
          milestones: [],
          minTeamSize: 3,
          maxTeamSize: 2,
        }),
      )
      .catch((error: CycleDomainError) => error);
    expect(elective).toMatchObject({ code: "INVALID_TEAM_SIZE" });
    const empty = await service.create(
      owner,
      createDto(2026, { kind: "ELECTIVE", milestones: [] }),
    );
    const blocked = await service
      .publish(owner, empty.id)
      .catch((error: CycleDomainError) => error);
    expect(blocked).toBeInstanceOf(CycleDomainError);
    expect((blocked as CycleDomainError).code).toBe("PUBLISH_BLOCKED");
    expect(
      (blocked as CycleDomainError).details?.map((detail) => detail.code),
    ).toEqual(["NO_MILESTONES", "ROSTER_EMPTY"]);
    expect((await service.checkPublish(owner, empty.id)).blocking).toHaveLength(
      2,
    );

    batchStudents = [];
    const core = await service.create(owner, createDto());
    const published = await service.publish(owner, core.id);
    expect(published.status).toBe("PUBLISHED");
    expect(published.warnings.map((warning) => warning.code)).toEqual([
      "NO_STUDENTS_YET",
    ]);
  });

  it("validates ownership", async () => {
    const created = await service.create(owner, createDto());
    await expect(
      service.update(otherFaculty, created.id, { title: "No access" }),
    ).rejects.toMatchObject({ code: "CYCLE_NOT_FOUND" });
    await expect(
      service.findById(otherFaculty, created.id),
    ).rejects.toMatchObject({ code: "CYCLE_NOT_FOUND" });
    await expect(
      service.publish(otherFaculty, created.id),
    ).rejects.toMatchObject({
      code: "CYCLE_NOT_FOUND",
    });
  });

  it("filters student visibility by persisted batch", async () => {
    const matching = await service.create(owner, createDto(2026));
    await service.publish(owner, matching.id);
    const otherBatch = await service.create(owner, createDto(2025));
    await service.publish(owner, otherBatch.id);
    const draft = await service.create(owner, createDto(2026));

    expect(
      (await service.listVisible(student("s26", 2026))).map((c) => c.id),
    ).toEqual([matching.id]);
    expect(await service.listVisible(student("s25", 2025))).toHaveLength(1);
    expect(await service.listVisible(student("s-null", null))).toEqual([]);
    await expect(
      service.findById(student("s25", 2025), matching.id),
    ).rejects.toMatchObject({ code: "CYCLE_NOT_FOUND" });
    await expect(
      service.findById(student("s26", 2026), draft.id),
    ).rejects.toMatchObject({ code: "CYCLE_NOT_FOUND" });
  });

  it("lists what comes next for a student, only from their own visible cycles", async () => {
    const mine = await service.create(owner, createDto(2026));
    await service.publish(owner, mine.id);
    const other = await service.create(
      owner,
      createDto(2025, { teamDeadline: nov(1) }),
    );
    await service.publish(owner, other.id);
    const upcoming = await service.upcomingFor(student("s26", 2026));
    expect(upcoming).toHaveLength(8);
    expect(new Set(upcoming.map((event) => event.cycle.id))).toEqual(
      new Set([mine.id]),
    );
    expect(upcoming.map((event) => event.at)).toEqual(
      [...upcoming.map((event) => event.at)].sort(),
    );
    expect(await service.upcomingFor(owner)).toEqual([]);
  });

  it("gives admins every published or closed cycle, read-only", async () => {
    const published = await service.create(owner, createDto());
    await service.publish(owner, published.id);
    const closed = await service.create(owner, createDto());
    await service.publish(owner, closed.id);
    await service.close(owner, closed.id);
    const draft = await service.create(owner, createDto());

    expect((await service.listVisible(admin)).map((c) => c.id).sort()).toEqual(
      [published.id, closed.id].sort(),
    );
    await expect(service.findById(admin, draft.id)).rejects.toMatchObject({
      code: "CYCLE_NOT_FOUND",
    });
    await expect(service.create(admin, createDto())).rejects.toMatchObject({
      code: "NOT_CYCLE_OWNER",
    });
  });

  it("shows pending staff nothing", async () => {
    const created = await service.create(owner, createDto());
    await service.publish(owner, created.id);
    expect(await service.listVisible(pendingStaff)).toEqual([]);
    await expect(
      service.findById(pendingStaff, created.id),
    ).rejects.toMatchObject({ code: "CYCLE_NOT_FOUND" });
  });

  it("defaults team rules to 1 to 4 members", async () => {
    const created = await service.create(owner, createDto());
    expect(created.minTeamSize).toBe(1);
    expect(created.maxTeamSize).toBe(4);
  });

  it("moves an open team deadline forward after publishing, never one that has passed", async () => {
    const created = await service.create(owner, createDto());
    await service.publish(owner, created.id);
    const extended = await service.update(owner, created.id, {
      teamDeadline: nov(5),
    });
    expect(extended.teamDeadline).toBe(nov(5));
    await expect(
      service.update(owner, created.id, { minTeamSize: 2 }),
    ).rejects.toMatchObject({ code: "CYCLE_FIELD_LOCKED" });
    clock.advance(Date.parse(nov(6)) - Date.parse(NOW));
    await expect(
      service.update(owner, created.id, { teamDeadline: nov(7) }),
    ).rejects.toMatchObject({ code: "CYCLE_FIELD_LOCKED" });
  });

  it("rejects student creation", async () => {
    await expect(
      service.create(student("s", 2026), createDto()),
    ).rejects.toMatchObject({ code: "NOT_CYCLE_OWNER" });
  });

  it("keeps domain errors identifiable", async () => {
    await expect(
      service.create(owner, { ...createDto(), academicYear: "2026-28" }),
    ).rejects.toBeInstanceOf(CycleDomainError);
  });
});
