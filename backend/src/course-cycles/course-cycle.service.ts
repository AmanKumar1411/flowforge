import { Injectable } from "@nestjs/common";
import { Clock } from "../common/clock";
import {
  CycleAuthorizationPolicy,
  CycleActor,
} from "./domain/cycle-authorization-policy";
import { CycleDomainError } from "./domain/cycle.errors";
import { CycleRepository } from "./domain/cycle-repository";
import { CyclePatch, Cycle } from "./domain/cycle.types";
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
    this.workflow.assertValidDeadline(dates.start, dates.deadline);
    this.assertAcademicYear(dto.academicYear);
    const cycle = await this.repository.create({
      courseName: dto.courseName.trim(),
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      batchYear: dto.batchYear,
      semester: dto.semester,
      academicYear: dto.academicYear,
      submissionStartAt: dates.start,
      submissionDeadline: dates.deadline,
      createdByFacultyId: actor.id,
    });
    return CycleResponseDto.fromCycle(cycle);
  }

  /** Students see published cycles for their batch; admins see every cycle that has been published. */
  async listVisible(actor: CycleActor): Promise<CycleResponseDto[]> {
    let cycles: Cycle[] = [];
    if (actor.role === "STUDENT" && actor.batchYear !== null) {
      cycles = await this.repository.listPublishedForBatch(actor.batchYear);
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
    const cycle = await this.getCycle(id);
    this.policy.assertCanRead(actor, cycle);
    return CycleResponseDto.fromCycle(cycle);
  }

  async update(
    actor: CycleActor,
    id: string,
    dto: UpdateCycleDto,
  ): Promise<CycleResponseDto> {
    const cycle = await this.getCycle(id);
    this.policy.assertOwner(actor, cycle);
    const patch = this.toPatch(dto);
    this.workflow.assertEditable(
      cycle.status,
      Object.keys(patch) as (keyof CyclePatch)[],
    );
    const merged = {
      ...cycle,
      ...patch,
    };
    this.assertAcademicYear(merged.academicYear);
    this.workflow.assertValidDeadline(
      merged.submissionStartAt,
      merged.submissionDeadline,
    );
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
    const cycle = await this.getCycle(id);
    this.policy.assertOwner(actor, cycle);
    const nextStatus = this.workflow.transition(cycle.status, "PUBLISH");
    this.workflow.validatePublishRules(
      cycle.submissionStartAt,
      cycle.submissionDeadline,
    );
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
    const cycle = await this.getCycle(id);
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

  private async getCycle(id: string): Promise<Cycle> {
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
    return patch;
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
