import { FixedClock } from "../common/testing/fixed-clock";
import { CycleDomainError } from "./domain/cycle.errors";
import { InMemoryCycleRepository } from "./domain/in-memory-cycle.repository";
import { CycleWorkflow } from "./domain/cycle-workflow";
import {
  CycleActor,
  CycleAuthorizationPolicy,
} from "./domain/cycle-authorization-policy";
import { CourseCycleService } from "./course-cycle.service";
import { CreateCycleDto } from "./dto/create-cycle.dto";

// Jest cannot load NestJS 12's ES modules on Node 22; stub the decorators the classes use.
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
});

const student = (id: string, batchYear: number | null): CycleActor => ({
  id,
  role: "STUDENT",
  batchYear,
});

const admin: CycleActor = { id: "admin", role: "ADMIN", batchYear: null };
const pendingStaff: CycleActor = {
  id: "pending",
  role: "PENDING_STAFF",
  batchYear: null,
};

const createDto = (batchYear = 2026): CreateCycleDto => ({
  courseName: "Software Design",
  title: "Software Development Projects",
  description: "Build and ship a useful system.",
  batchYear,
  semester: 7,
  academicYear: "2026-27",
  submissionStartAt: "2026-10-01T09:00:00.000Z",
  submissionDeadline: "2026-12-01T17:00:00.000Z",
});

describe("CourseCycleService", () => {
  let service: CourseCycleService;
  beforeEach(() => {
    service = new CourseCycleService(
      new InMemoryCycleRepository(),
      new CycleWorkflow(),
      new CycleAuthorizationPolicy(),
      new FixedClock("2026-10-23T09:00:00.000Z"),
    );
  });
  const owner = faculty("faculty-a");
  const otherFaculty = faculty("faculty-b");

  it("creates, publishes, closes, and restricts fields by state", async () => {
    const created = await service.create(owner, createDto());
    expect(created.status).toBe("DRAFT");

    const edited = await service.update(owner, created.id, {
      description: "Updated description",
    });
    expect(edited.description).toBe("Updated description");

    const published = await service.publish(owner, created.id);
    expect(published.status).toBe("PUBLISHED");
    await expect(
      service.update(owner, created.id, { title: "Locked title" }),
    ).rejects.toMatchObject({ code: "CYCLE_FIELD_LOCKED" });

    const deadlineEdited = await service.update(owner, created.id, {
      submissionDeadline: "2026-12-15T17:00:00.000Z",
    });
    expect(deadlineEdited.submissionDeadline).toBe("2026-12-15T17:00:00.000Z");

    const closed = await service.close(owner, created.id);
    expect(closed.status).toBe("CLOSED");
    await expect(service.close(owner, created.id)).rejects.toMatchObject({
      code: "CYCLE_ALREADY_CLOSED",
    });
    await expect(
      service.update(owner, created.id, { description: "No" }),
    ).rejects.toMatchObject({ code: "CYCLE_ALREADY_CLOSED" });
  });

  it("validates merged deadlines and ownership", async () => {
    const created = await service.create(owner, createDto());
    await expect(
      service.update(owner, created.id, {
        submissionDeadline: "2026-09-01T17:00:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "INVALID_DEADLINE" });
    await expect(
      service.update(otherFaculty, created.id, { title: "No access" }),
    ).rejects.toMatchObject({ code: "CYCLE_NOT_FOUND" });
    await expect(
      service.findById(otherFaculty, created.id),
    ).rejects.toMatchObject({ code: "CYCLE_NOT_FOUND" });
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

  it("gives admins every published or closed cycle, read-only", async () => {
    const published = await service.create(owner, createDto(2026));
    await service.publish(owner, published.id);
    const closed = await service.create(owner, createDto(2025));
    await service.publish(owner, closed.id);
    await service.close(owner, closed.id);
    const draft = await service.create(owner, createDto(2026));

    expect((await service.listVisible(admin)).map((c) => c.id).sort()).toEqual(
      [published.id, closed.id].sort(),
    );
    await expect(service.findById(admin, draft.id)).rejects.toMatchObject({
      code: "CYCLE_NOT_FOUND",
    });
    await expect(
      service.update(admin, published.id, { description: "No" }),
    ).rejects.toMatchObject({ code: "NOT_CYCLE_OWNER" });
  });

  it("shows pending staff nothing", async () => {
    const published = await service.create(owner, createDto(2026));
    await service.publish(owner, published.id);

    expect(await service.listVisible(pendingStaff)).toEqual([]);
    await expect(
      service.findById(pendingStaff, published.id),
    ).rejects.toMatchObject({ code: "CYCLE_NOT_FOUND" });
  });

  it("rejects student creation", async () => {
    await expect(
      service.create(student("s26", 2026), createDto()),
    ).rejects.toMatchObject({ code: "NOT_CYCLE_OWNER" });
  });

  it("keeps domain errors identifiable", async () => {
    try {
      await service.findById(owner, "missing");
    } catch (error) {
      expect(error).toBeInstanceOf(CycleDomainError);
      expect((error as CycleDomainError).code).toBe("CYCLE_NOT_FOUND");
    }
  });
});
