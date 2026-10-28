import { Injectable } from "@nestjs/common";
import { Clock } from "../common/clock";
import {
  CycleAuthorizationPolicy,
  CycleActor,
} from "./domain/cycle-authorization-policy";
import { CycleDomainError } from "./domain/cycle.errors";
import { CycleRepository } from "./domain/cycle-repository";
import {
  Cycle,
  CycleCreateData,
  CyclePatch,
  DEFAULT_TEAM_SIZE,
  STAGE_DEADLINES,
} from "./domain/cycle.types";
import { CycleWorkflow } from "./domain/cycle-workflow";
import { CreateCycleDto } from "./dto/create-cycle.dto";
import { CycleResponseDto } from "./dto/cycle-response.dto";
import { UpdateCycleDto } from "./dto/update-cycle.dto";

@Injectable()
export class CourseCycleService {
  constructor(
    private readonly repository: CycleRepository,
    private readonly workflow: CycleWorkflow,
    private readonly policy: CycleAuthorizationPolicy,
    private readonly clock: Clock,
  ) {}

  async create(
    actor: CycleActor,
    dto: CreateCycleDto,
  ): Promise<CycleResponseDto> {
    this.policy.assertFaculty(actor);
    const dates = this.parseDates(
      dto.submissionStartAt,
      dto.submissionDeadline,
    );
    // By default teams must be formed by the time submissions open.
    const formationDeadline = dto.teamFormationDeadline
      ? new Date(dto.teamFormationDeadline)
      : dates.start;
    // By default there is no faculty completion window, and ideas are due when it ends.
    const completionDeadline = dto.teamCompletionDeadline
      ? new Date(dto.teamCompletionDeadline)
      : formationDeadline;
    const data: CycleCreateData = {
      courseName: dto.courseName.trim(),
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      batchYear: dto.batchYear,
      semester: dto.semester,
      academicYear: dto.academicYear,
      submissionStartAt: dates.start,
      submissionDeadline: dates.deadline,
      minTeamSize: dto.minTeamSize ?? DEFAULT_TEAM_SIZE.min,
      maxTeamSize: dto.maxTeamSize ?? DEFAULT_TEAM_SIZE.max,
      teamFormationDeadline: formationDeadline,
      teamCompletionDeadline: completionDeadline,
      ideaDeadline: dto.ideaDeadline
        ? new Date(dto.ideaDeadline)
        : completionDeadline,
      kind: dto.kind ?? "CORE",
      createdByFacultyId: actor.id,
    };
    this.workflow.assertValidSchedule(data);
    this.assertAcademicYear(dto.academicYear);
    const cycle = await this.repository.create(data);
    return CycleResponseDto.fromCycle(cycle);
  }

  /**
   * Students see published core cycles of their batch and published electives
   * they are enrolled in; admins see every cycle that has been published.
   */
  async listVisible(actor: CycleActor): Promise<CycleResponseDto[]> {
    let cycles: Cycle[] = [];
    if (actor.role === "STUDENT") {
      cycles = await this.repository.listPublishedForStudent(
        actor.batchYear,
        actor.email,
      );
    } else if (actor.role === "ADMIN") {
      cycles = await this.repository.listPublishedOrClosed();
    }
    return cycles.map(CycleResponseDto.fromCycle);
  }

  async listMine(actor: CycleActor): Promise<CycleResponseDto[]> {
    this.policy.assertFaculty(actor);
    const cycles = await this.repository.listByOwner(actor.id);
    return cycles.map(CycleResponseDto.fromCycle);
  }

  async findById(actor: CycleActor, id: string): Promise<CycleResponseDto> {
    return CycleResponseDto.fromCycle(await this.getVisibleCycle(actor, id));
  }

  /** For modules that build on cycles (teams): the cycle, or CYCLE_NOT_FOUND when the actor may not see it. */
  async getVisibleCycle(actor: CycleActor, id: string): Promise<Cycle> {
    const cycle = await this.getById(id);
    const enrolled =
      actor.role === "STUDENT" &&
      cycle.kind === "ELECTIVE" &&
      (await this.repository.isEnrolled(cycle.id, actor.email));
    this.policy.assertCanRead(actor, cycle, enrolled);
    return cycle;
  }

  async update(
    actor: CycleActor,
    id: string,
    dto: UpdateCycleDto,
  ): Promise<CycleResponseDto> {
    const cycle = await this.getById(id);
    this.policy.assertOwner(actor, cycle);
    const patch = this.toPatch(dto);
    this.workflow.assertEditable(
      cycle.status,
      Object.keys(patch) as (keyof CyclePatch)[],
    );
    if (cycle.status === "PUBLISHED") {
      for (const deadline of STAGE_DEADLINES) {
        const next = patch[deadline];
        if (next !== undefined) {
          this.workflow.assertStageDeadlineChange(
            deadline,
            cycle[deadline],
            next,
            this.clock.now(),
          );
        }
      }
    }
    this.followMovedStages(cycle, patch);
    const merged = {
      ...cycle,
      ...patch,
    };
    this.assertAcademicYear(merged.academicYear);
    this.workflow.assertValidSchedule(merged);
    const updated = await this.repository.updateFields(id, cycle.status, patch);
    if (!updated) {
      throw new CycleDomainError(
        "INVALID_STATUS_TRANSITION",
        "The cycle changed while it was being edited",
      );
    }
    return CycleResponseDto.fromCycle(updated);
  }

  async publish(actor: CycleActor, id: string): Promise<CycleResponseDto> {
    const cycle = await this.getById(id);
    this.policy.assertOwner(actor, cycle);
    const nextStatus = this.workflow.transition(cycle.status, "PUBLISH");
    this.workflow.validatePublishRules(cycle);
    const published = await this.repository.transitionStatus(
      id,
      cycle.status,
      nextStatus,
      this.clock.now(),
    );
    if (!published) {
      throw new CycleDomainError(
        "INVALID_STATUS_TRANSITION",
        "The cycle changed while it was being published",
      );
    }
    return CycleResponseDto.fromCycle(published);
  }

  async close(actor: CycleActor, id: string): Promise<CycleResponseDto> {
    const cycle = await this.getById(id);
    this.policy.assertOwner(actor, cycle);
    const nextStatus = this.workflow.transition(cycle.status, "CLOSE");
    const closed = await this.repository.transitionStatus(
      id,
      cycle.status,
      nextStatus,
      this.clock.now(),
    );
    if (!closed) {
      throw new CycleDomainError(
        "INVALID_STATUS_TRANSITION",
        "The cycle changed while it was being closed",
      );
    }
    return CycleResponseDto.fromCycle(closed);
  }

  /** For modules that build on cycles, when the rule does not depend on the caller (a team's own cycle). */
  async getById(id: string): Promise<Cycle> {
    const cycle = await this.repository.findById(id);
    if (!cycle) {
      throw new CycleDomainError("CYCLE_NOT_FOUND", "Course cycle not found");
    }
    return cycle;
  }

  private parseDates(
    start: string,
    deadline: string,
  ): { start: Date; deadline: Date } {
    const parsedStart = new Date(start);
    const parsedDeadline = new Date(deadline);
    if (
      Number.isNaN(parsedStart.getTime()) ||
      Number.isNaN(parsedDeadline.getTime())
    ) {
      throw new CycleDomainError(
        "INVALID_DEADLINE",
        "Cycle dates must be valid ISO timestamps",
      );
    }
    return { start: parsedStart, deadline: parsedDeadline };
  }

  private toPatch(dto: UpdateCycleDto): CyclePatch {
    const patch: CyclePatch = {};
    if (dto.batchYear !== undefined) patch.batchYear = dto.batchYear;
    if (dto.semester !== undefined) patch.semester = dto.semester;
    if (dto.academicYear !== undefined) patch.academicYear = dto.academicYear;
    if (dto.courseName !== undefined) patch.courseName = dto.courseName.trim();
    if (dto.title !== undefined) patch.title = dto.title.trim();
    if (dto.description !== undefined) {
      patch.description = dto.description?.trim() || null;
    }
    if (dto.submissionStartAt !== undefined) {
      patch.submissionStartAt = new Date(dto.submissionStartAt);
    }
    if (dto.submissionDeadline !== undefined) {
      patch.submissionDeadline = new Date(dto.submissionDeadline);
    }
    if (dto.minTeamSize !== undefined) patch.minTeamSize = dto.minTeamSize;
    if (dto.maxTeamSize !== undefined) patch.maxTeamSize = dto.maxTeamSize;
    if (dto.teamFormationDeadline !== undefined) {
      patch.teamFormationDeadline = new Date(dto.teamFormationDeadline);
    }
    if (dto.teamCompletionDeadline !== undefined) {
      patch.teamCompletionDeadline = new Date(dto.teamCompletionDeadline);
    }
    if (dto.ideaDeadline !== undefined) {
      patch.ideaDeadline = new Date(dto.ideaDeadline);
    }
    if (dto.kind !== undefined) patch.kind = dto.kind;
    return patch;
  }

  /**
   * A stage that ends together with the one before it keeps doing so when that
   * earlier deadline moves on its own: a cycle without a faculty window, or
   * without a separate idea deadline, does not gain one by accident.
   */
  private followMovedStages(cycle: Cycle, patch: CyclePatch): void {
    for (let index = 1; index < STAGE_DEADLINES.length; index += 1) {
      const earlier = STAGE_DEADLINES[index - 1];
      const later = STAGE_DEADLINES[index];
      const moved = patch[earlier];
      if (
        moved !== undefined &&
        patch[later] === undefined &&
        cycle[later].getTime() === cycle[earlier].getTime()
      ) {
        patch[later] = moved;
      }
    }
  }

  private assertAcademicYear(value: string): void {
    const match = /^(\d{4})-(\d{2})$/.exec(value);
    if (!match || Number(match[2]) !== (Number(match[1]) + 1) % 100) {
      throw new CycleDomainError(
        "INVALID_ACADEMIC_YEAR",
        "Academic year must use the YYYY-YY format with consecutive years",
      );
    }
  }
}
