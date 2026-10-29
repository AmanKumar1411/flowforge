import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { Clock } from "../../common/clock";
import { LinkRequirement } from "../../common/links/link-requirement";
import { Transaction, TransactionRunner } from "../../common/transaction";
import {
  CycleAuthorizationPolicy,
  CycleActor,
} from "../domain/cycle-authorization-policy";
import { CycleDomainError } from "../domain/cycle.errors";
import { byTime, CycleTimeline } from "../domain/cycle-timeline";
import {
  Cycle,
  CycleCreateData,
  CyclePatch,
  DEFAULT_TEAM_SIZE,
  EditableField,
  STAGE_DEADLINES,
} from "../domain/cycle.types";
import { CycleWorkflow } from "../domain/cycle-workflow";
import {
  cleanMilestone,
  Milestone,
  MilestoneInput,
  planMilestones,
  unknownIds,
} from "../domain/milestone";
import { CreateCycleDto } from "../presentation/dto/create-cycle.dto";
import {
  CycleResponseDto,
  PublishChecksDto,
  PublishResponseDto,
  UpcomingEventDto,
} from "../presentation/dto/cycle-response.dto";
import { MilestoneDto } from "../presentation/dto/milestone.dto";
import { UpdateCycleDto } from "../presentation/dto/update-cycle.dto";
import { CycleRepository } from "./ports/cycle.repository";
import { PublishChecks } from "./publish-checks";

/** How many events `GET /me/upcoming` returns. */
const UPCOMING_LIMIT = 10;

/**
 * The cycle aggregate's use cases. Every change locks the cycle row, saves the
 * cycle and its milestones together, and audits in the same transaction.
 */
@Injectable()
export class CourseCycleService {
  constructor(
    private readonly repository: CycleRepository,
    private readonly workflow: CycleWorkflow,
    private readonly policy: CycleAuthorizationPolicy,
    private readonly publishChecks: PublishChecks,
    private readonly timeline: CycleTimeline,
    private readonly audit: AuditService,
    private readonly transactions: TransactionRunner,
    private readonly clock: Clock,
  ) {}

  async create(
    actor: CycleActor,
    dto: CreateCycleDto,
  ): Promise<CycleResponseDto> {
    this.policy.assertFaculty(actor);
    const data: CycleCreateData = {
      courseName: dto.courseName.trim(),
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      batchYear: dto.batchYear,
      semester: dto.semester,
      academicYear: dto.academicYear,
      minTeamSize: dto.minTeamSize ?? DEFAULT_TEAM_SIZE.min,
      maxTeamSize: dto.maxTeamSize ?? DEFAULT_TEAM_SIZE.max,
      teamDeadline: parseDate(dto.teamDeadline),
      ideaDeadline: parseDate(dto.ideaDeadline),
      ideaSource: dto.ideaSource ?? "BOTH",
      ideaLinkRequirement: dto.ideaLinkRequirement
        ? LinkRequirement.from(dto.ideaLinkRequirement)
        : LinkRequirement.IDEA_DEFAULT,
      kind: dto.kind ?? "CORE",
      createdByFacultyId: actor.id,
    };
    const milestones = this.milestoneInputs(dto.milestones ?? [], []);
    this.workflow.assertValidSchedule({ ...data, milestones });
    this.assertAcademicYear(dto.academicYear);
    const cycle = await this.transactions.run(async (tx) => {
      const created = await this.repository.create(
        data,
        planMilestones([], milestones).create,
        tx,
      );
      await this.record("CYCLE_CREATED", actor, created, tx, {
        kind: created.kind,
        milestones: created.milestones.length,
      });
      return created;
    });
    return this.toResponse(cycle);
  }

  /**
   * Students see published core cycles of their batch and published electives
   * they are enrolled in; admins see every cycle that has been published.
   */
  async listVisible(actor: CycleActor): Promise<CycleResponseDto[]> {
    return (await this.visibleCycles(actor)).map((cycle) =>
      this.toResponse(cycle),
    );
  }

  /** What comes next across the student's visible cycles, soonest first (computed, ADR 017). */
  async upcomingFor(actor: CycleActor): Promise<UpcomingEventDto[]> {
    if (actor.role !== "STUDENT") return [];
    const cycles = await this.visibleCycles(actor);
    return cycles
      .flatMap((cycle) =>
        this.timeline
          .upcomingEvents(cycle, UPCOMING_LIMIT)
          .map((event) => ({ event, cycle })),
      )
      .sort((a, b) => byTime(a.event, b.event))
      .slice(0, UPCOMING_LIMIT)
      .map(({ event, cycle }) => UpcomingEventDto.fromEvent(event, cycle));
  }

  async listMine(actor: CycleActor): Promise<CycleResponseDto[]> {
    this.policy.assertFaculty(actor);
    const cycles = await this.repository.listByOwner(actor.id);
    return cycles.map((cycle) => this.toResponse(cycle));
  }

  async findById(actor: CycleActor, id: string): Promise<CycleResponseDto> {
    return this.toResponse(await this.getVisibleCycle(actor, id));
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
    const patch = this.toPatch(dto);
    const fields: EditableField[] = [
      ...(Object.keys(patch) as (keyof CyclePatch)[]),
      ...(dto.milestones ? (["milestones"] as const) : []),
    ];
    const updated = await this.transactions.run(async (tx) => {
      const cycle = await this.lockOwned(actor, id, tx);
      this.workflow.assertEditable(cycle.status, fields);
      const milestones = dto.milestones
        ? this.milestoneInputs(dto.milestones, cycle.milestones)
        : null;
      if (cycle.status === "PUBLISHED") {
        const now = this.clock.now();
        for (const deadline of STAGE_DEADLINES) {
          const next = patch[deadline];
          if (next && next.getTime() !== cycle[deadline].getTime()) {
            this.workflow.assertStageDeadlineChange(
              deadline,
              cycle[deadline],
              next,
              now,
            );
          }
        }
        if (milestones) {
          this.workflow.assertPublishedMilestones(
            cycle.milestones,
            milestones,
            now,
          );
        }
      }
      const merged = { ...cycle, ...patch };
      this.assertAcademicYear(merged.academicYear);
      this.workflow.assertValidSchedule({
        ...merged,
        milestones: milestones ?? cycle.milestones,
      });
      const saved = await this.repository.update(
        id,
        cycle.status,
        patch,
        milestones ? planMilestones(cycle.milestones, milestones) : null,
        tx,
      );
      if (!saved) {
        throw new CycleDomainError(
          "INVALID_STATUS_TRANSITION",
          "The cycle changed while it was being edited",
        );
      }
      await this.record("CYCLE_UPDATED", actor, saved, tx, { fields });
      return saved;
    });
    return this.toResponse(updated);
  }

  /** What publishing would report now, without publishing: for the faculty's review step. */
  async checkPublish(actor: CycleActor, id: string): Promise<PublishChecksDto> {
    return this.transactions.run(async (tx) => {
      const cycle = await this.lockOwned(actor, id, tx);
      this.workflow.transition(cycle.status, "PUBLISH");
      return PublishChecksDto.from(await this.publishChecks.run(cycle, tx));
    });
  }

  /** Runs every publish check; any blocking one stops it, and all of them are reported (409 PUBLISH_BLOCKED). */
  async publish(actor: CycleActor, id: string): Promise<PublishResponseDto> {
    return this.transactions.run(async (tx) => {
      const cycle = await this.lockOwned(actor, id, tx);
      const nextStatus = this.workflow.transition(cycle.status, "PUBLISH");
      const report = await this.publishChecks.run(cycle, tx);
      if (report.blocking.length > 0) {
        throw new CycleDomainError(
          "PUBLISH_BLOCKED",
          `The project cannot be published yet: ${report.blocking.length === 1 ? "1 thing needs" : `${report.blocking.length} things need`} fixing`,
          report.blocking,
        );
      }
      const published = await this.transition(cycle, nextStatus, tx);
      await this.record("CYCLE_PUBLISHED", actor, published, tx, {
        warnings: report.warnings.map((warning) => warning.code),
      });
      return Object.assign(this.toResponse(published), {
        warnings: report.warnings,
      });
    });
  }

  async close(actor: CycleActor, id: string): Promise<CycleResponseDto> {
    const closed = await this.transactions.run(async (tx) => {
      const cycle = await this.lockOwned(actor, id, tx);
      const nextStatus = this.workflow.transition(cycle.status, "CLOSE");
      const saved = await this.transition(cycle, nextStatus, tx);
      await this.record("CYCLE_CLOSED", actor, saved, tx);
      return saved;
    });
    return this.toResponse(closed);
  }

  /** For modules that build on cycles, when the rule does not depend on the caller (a team's own cycle). */
  async getById(id: string): Promise<Cycle> {
    const cycle = await this.repository.findById(id);
    if (!cycle) {
      throw new CycleDomainError("CYCLE_NOT_FOUND", "Course cycle not found");
    }
    return cycle;
  }

  private visibleCycles(actor: CycleActor): Promise<Cycle[]> {
    if (actor.role === "STUDENT") {
      return this.repository.listPublishedForStudent(
        actor.batchYear,
        actor.email,
      );
    }
    if (actor.role === "ADMIN") return this.repository.listPublishedOrClosed();
    return Promise.resolve([]);
  }

  private async lockOwned(
    actor: CycleActor,
    id: string,
    tx: Transaction,
  ): Promise<Cycle> {
    const cycle = await this.repository.lockById(id, tx);
    if (!cycle) {
      throw new CycleDomainError("CYCLE_NOT_FOUND", "Course cycle not found");
    }
    this.policy.assertOwner(actor, cycle);
    return cycle;
  }

  private async transition(
    cycle: Cycle,
    nextStatus: Cycle["status"],
    tx: Transaction,
  ): Promise<Cycle> {
    const saved = await this.repository.transitionStatus(
      cycle.id,
      cycle.status,
      nextStatus,
      this.clock.now(),
      tx,
    );
    if (!saved) {
      throw new CycleDomainError(
        "INVALID_STATUS_TRANSITION",
        "The cycle changed while its state was changing",
      );
    }
    return saved;
  }

  private record(
    action:
      "CYCLE_CREATED" | "CYCLE_UPDATED" | "CYCLE_PUBLISHED" | "CYCLE_CLOSED",
    actor: CycleActor,
    cycle: Cycle,
    tx: Transaction,
    metadata: Record<string, string | number | readonly string[]> = {},
  ): Promise<void> {
    return this.audit.record(tx, {
      action,
      actorId: actor.id,
      entityType: "CourseProjectCycle",
      entityId: cycle.id,
      metadata: { status: cycle.status, ...metadata },
    });
  }

  private toResponse(cycle: Cycle): CycleResponseDto {
    return CycleResponseDto.fromCycle(cycle, this.timeline);
  }

  /**
   * The requested milestones as domain inputs. An item naming an existing
   * milestone keeps whatever optional field it leaves out; an unknown id is
   * refused before anything is saved.
   */
  private milestoneInputs(
    items: readonly MilestoneDto[],
    current: readonly Milestone[],
  ): MilestoneInput[] {
    const byId = new Map(current.map((milestone) => [milestone.id, milestone]));
    const inputs = items.map((item): MilestoneInput => {
      const existing = item.id ? byId.get(item.id) : undefined;
      return cleanMilestone({
        id: item.id,
        name: item.name,
        description:
          item.description === undefined
            ? (existing?.description ?? null)
            : item.description,
        submissionOpensAt: parseDate(item.submissionOpensAt),
        submissionDueAt: parseDate(item.submissionDueAt),
        evaluationAt: parseDate(item.evaluationAt),
        linkRequirement: item.linkRequirement
          ? LinkRequirement.from(item.linkRequirement)
          : (existing?.linkRequirement ?? LinkRequirement.MILESTONE_DEFAULT),
      });
    });
    if (unknownIds(current, inputs).length > 0) {
      throw new CycleDomainError(
        "MILESTONE_NOT_FOUND",
        "A milestone in the list is not one of this project's, or appears twice",
      );
    }
    return inputs;
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
    if (dto.minTeamSize !== undefined) patch.minTeamSize = dto.minTeamSize;
    if (dto.maxTeamSize !== undefined) patch.maxTeamSize = dto.maxTeamSize;
    if (dto.teamDeadline !== undefined) {
      patch.teamDeadline = parseDate(dto.teamDeadline);
    }
    if (dto.ideaDeadline !== undefined) {
      patch.ideaDeadline = parseDate(dto.ideaDeadline);
    }
    if (dto.ideaSource !== undefined) patch.ideaSource = dto.ideaSource;
    if (dto.ideaLinkRequirement !== undefined) {
      patch.ideaLinkRequirement = LinkRequirement.from(dto.ideaLinkRequirement);
    }
    if (dto.kind !== undefined) patch.kind = dto.kind;
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

function parseDate(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new CycleDomainError(
      "INVALID_DEADLINE",
      "Cycle dates must be valid ISO timestamps",
    );
  }
  return date;
}
