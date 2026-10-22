import { BadRequestException, HttpException, Injectable } from "@nestjs/common";
import type { JwtPayload } from "../auth/auth.service";
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

const errorStatus: Record<string, number> = {
  CYCLE_NOT_FOUND: 404,
  NOT_CYCLE_OWNER: 403,
  UNAUTHORIZED_BATCH_ACCESS: 403,
  INVALID_STATUS_TRANSITION: 409,
  CYCLE_ALREADY_CLOSED: 409,
  CYCLE_FIELD_LOCKED: 409,
  INVALID_DEADLINE: 400,
};

@Injectable()
export class CourseCycleService {
  constructor(
    private readonly repository: CycleRepository,
    private readonly workflow: CycleWorkflow,
    private readonly policy: CycleAuthorizationPolicy,
  ) {}

  async create(
    actor: JwtPayload,
    dto: CreateCycleDto,
  ): Promise<CycleResponseDto> {
    const cycleActor = this.actor(actor);
    this.policy.assertFaculty(cycleActor);
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
      createdByFacultyId: cycleActor.id,
    });
    return CycleResponseDto.fromCycle(cycle);
  }

  async listForStudent(actor: JwtPayload): Promise<CycleResponseDto[]> {
    const cycleActor = this.actor(actor);
    if (cycleActor.role !== "STUDENT" || cycleActor.batchYear === null) {
      return [];
    }
    const cycles = await this.repository.listPublishedForBatch(
      cycleActor.batchYear,
    );
    return cycles.map(CycleResponseDto.fromCycle);
  }

  async listMine(actor: JwtPayload): Promise<CycleResponseDto[]> {
    const cycleActor = this.actor(actor);
    this.policy.assertFaculty(cycleActor);
    const cycles = await this.repository.listByOwner(cycleActor.id);
    return cycles.map(CycleResponseDto.fromCycle);
  }

  async findById(actor: JwtPayload, id: string): Promise<CycleResponseDto> {
    const cycle = await this.getCycle(id);
    const cycleActor = this.actor(actor);
    if (cycleActor.role === "FACULTY") {
      this.policy.assertOwner(cycleActor, cycle);
    } else {
      this.policy.assertStudentBatchAccess(cycleActor, cycle);
    }
    return CycleResponseDto.fromCycle(cycle);
  }

  async update(
    actor: JwtPayload,
    id: string,
    dto: UpdateCycleDto,
  ): Promise<CycleResponseDto> {
    const cycle = await this.getCycle(id);
    const cycleActor = this.actor(actor);
    this.policy.assertOwner(cycleActor, cycle);
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

  async publish(actor: JwtPayload, id: string): Promise<CycleResponseDto> {
    const cycle = await this.getCycle(id);
    const cycleActor = this.actor(actor);
    this.policy.assertOwner(cycleActor, cycle);
    const nextStatus = this.workflow.transition(cycle.status, "PUBLISH");
    this.workflow.validatePublishRules(
      cycle.submissionStartAt,
      cycle.submissionDeadline,
    );
    const published = await this.repository.transitionStatus(
      id,
      cycle.status,
      nextStatus,
      new Date(),
    );
    if (!published) {
      throw new CycleDomainError(
        "INVALID_STATUS_TRANSITION",
        "The cycle changed while it was being published",
      );
    }
    return CycleResponseDto.fromCycle(published);
  }

  async close(actor: JwtPayload, id: string): Promise<CycleResponseDto> {
    const cycle = await this.getCycle(id);
    const cycleActor = this.actor(actor);
    this.policy.assertOwner(cycleActor, cycle);
    const nextStatus = this.workflow.transition(cycle.status, "CLOSE");
    const closed = await this.repository.transitionStatus(
      id,
      cycle.status,
      nextStatus,
      new Date(),
    );
    if (!closed) {
      throw new CycleDomainError(
        "INVALID_STATUS_TRANSITION",
        "The cycle changed while it was being closed",
      );
    }
    return CycleResponseDto.fromCycle(closed);
  }

  private actor(actor: JwtPayload): CycleActor {
    return { id: actor.sub, role: actor.role, batchYear: actor.batchYear };
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
      throw new BadRequestException(
        "Academic year must use the YYYY-YY format with consecutive years",
      );
    }
  }

  static toHttpException(error: unknown): HttpException | unknown {
    if (!(error instanceof CycleDomainError)) {
      return error;
    }
    return new HttpException(
      { code: error.code, message: error.message },
      errorStatus[error.code],
    );
  }
}
