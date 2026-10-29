import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ErrorDetail } from "../../../common/errors/domain-error";
import { PublishReport } from "../../application/publish-checks";
import {
  CycleEvent,
  CycleEventKind,
  CycleStage,
  CycleTimeline,
  MilestonePhase,
  TimelineMilestone,
} from "../../domain/cycle-timeline";
import { Cycle, CycleIdeaSource } from "../../domain/cycle.types";
import { Milestone } from "../../domain/milestone";
import { LinkRequirementDto } from "./milestone.dto";

/** How many upcoming events a cycle carries. */
export const NEXT_EVENTS = 3;

export class MilestoneResponseDto {
  @ApiProperty()
  id!: string;
  @ApiProperty({ description: "1…n" })
  position!: number;
  @ApiProperty()
  name!: string;
  @ApiProperty({ type: String, nullable: true })
  description!: string | null;
  @ApiProperty()
  submissionOpensAt!: string;
  @ApiProperty({ description: "Versions are accepted strictly before then" })
  submissionDueAt!: string;
  @ApiProperty()
  evaluationAt!: string;
  @ApiProperty({ type: LinkRequirementDto })
  linkRequirement!: LinkRequirementDto;

  static from(milestone: Milestone): MilestoneResponseDto {
    return Object.assign(new MilestoneResponseDto(), {
      id: milestone.id,
      position: milestone.position,
      name: milestone.name,
      description: milestone.description,
      submissionOpensAt: milestone.submissionOpensAt.toISOString(),
      submissionDueAt: milestone.submissionDueAt.toISOString(),
      evaluationAt: milestone.evaluationAt.toISOString(),
      linkRequirement: milestone.linkRequirement.toJSON(),
    });
  }
}

export class MilestoneRefDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  position!: number;
  @ApiProperty()
  name!: string;

  static from({ id, position, name }: TimelineMilestone): MilestoneRefDto {
    return Object.assign(new MilestoneRefDto(), { id, position, name });
  }
}

const STAGE_KINDS = [
  "DRAFT",
  "TEAMS",
  "IDEAS",
  "MILESTONE",
  "WRAP_UP",
  "CLOSED",
];

export class CycleStageDto {
  @ApiProperty({ enum: STAGE_KINDS })
  kind!: CycleStage["kind"];
  @ApiPropertyOptional({ type: MilestoneRefDto, description: "For MILESTONE" })
  milestone?: MilestoneRefDto;
  @ApiPropertyOptional({
    enum: ["UPCOMING", "OPEN", "AWAITING_EVALUATION"],
    description: "For MILESTONE",
  })
  phase?: MilestonePhase;

  static from(stage: CycleStage): CycleStageDto {
    return Object.assign(
      new CycleStageDto(),
      stage.kind === "MILESTONE"
        ? {
            kind: stage.kind,
            milestone: MilestoneRefDto.from(stage.milestone),
            phase: stage.phase,
          }
        : { kind: stage.kind },
    );
  }
}

export class CycleEventDto {
  @ApiProperty({
    enum: [
      "TEAM_DEADLINE",
      "IDEA_DEADLINE",
      "SUBMISSION_OPENS",
      "SUBMISSION_DUE",
      "EVALUATION",
    ],
  })
  kind!: CycleEventKind;
  @ApiProperty()
  at!: string;
  @ApiPropertyOptional({ type: MilestoneRefDto })
  milestone?: MilestoneRefDto;

  static from(event: CycleEvent): CycleEventDto {
    return Object.assign(new CycleEventDto(), {
      kind: event.kind,
      at: event.at.toISOString(),
      ...(event.milestone
        ? { milestone: MilestoneRefDto.from(event.milestone) }
        : {}),
    });
  }
}

export class CycleResponseDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  courseName!: string;
  @ApiProperty()
  title!: string;
  @ApiProperty({ type: String, nullable: true })
  description!: string | null;
  @ApiProperty()
  batchYear!: number;
  @ApiProperty()
  semester!: number;
  @ApiProperty()
  academicYear!: string;
  @ApiProperty()
  minTeamSize!: number;
  @ApiProperty()
  maxTeamSize!: number;
  @ApiProperty({
    description:
      "Students change their own teams until then; the owning faculty then place students without a team until ideaDeadline",
  })
  teamDeadline!: string;
  @ApiProperty({
    description:
      "Teams submit or pick their first idea until then; feedback rounds continue after it",
  })
  ideaDeadline!: string;
  @ApiProperty({ enum: ["STUDENT_PROPOSALS", "FACULTY_LIST", "BOTH"] })
  ideaSource!: CycleIdeaSource;
  @ApiProperty({ type: LinkRequirementDto })
  ideaLinkRequirement!: LinkRequirementDto;
  @ApiProperty({ type: MilestoneResponseDto, isArray: true })
  milestones!: MilestoneResponseDto[];
  @ApiProperty({ enum: ["CORE", "ELECTIVE"] })
  kind!: Cycle["kind"];
  @ApiProperty({ enum: ["DRAFT", "PUBLISHED", "CLOSED"] })
  status!: Cycle["status"];
  @ApiProperty({
    type: CycleStageDto,
    description: "Computed from the dates and the clock; nothing is stored",
  })
  currentStage!: CycleStageDto;
  @ApiProperty({
    type: CycleEventDto,
    isArray: true,
    description: `The next ${NEXT_EVENTS} events, in time order`,
  })
  nextEvents!: CycleEventDto[];
  @ApiProperty({ type: String, nullable: true })
  publishedAt!: string | null;
  @ApiProperty({ type: String, nullable: true })
  closedAt!: string | null;
  @ApiProperty()
  createdAt!: string;
  @ApiProperty()
  updatedAt!: string;

  static fromCycle(cycle: Cycle, timeline: CycleTimeline): CycleResponseDto {
    return Object.assign(new CycleResponseDto(), {
      id: cycle.id,
      courseName: cycle.courseName,
      title: cycle.title,
      description: cycle.description,
      batchYear: cycle.batchYear,
      semester: cycle.semester,
      academicYear: cycle.academicYear,
      minTeamSize: cycle.minTeamSize,
      maxTeamSize: cycle.maxTeamSize,
      teamDeadline: cycle.teamDeadline.toISOString(),
      ideaDeadline: cycle.ideaDeadline.toISOString(),
      ideaSource: cycle.ideaSource,
      ideaLinkRequirement: cycle.ideaLinkRequirement.toJSON(),
      milestones: cycle.milestones.map(MilestoneResponseDto.from),
      kind: cycle.kind,
      status: cycle.status,
      currentStage: CycleStageDto.from(timeline.currentStage(cycle)),
      nextEvents: timeline
        .upcomingEvents(cycle, NEXT_EVENTS)
        .map(CycleEventDto.from),
      publishedAt: cycle.publishedAt?.toISOString() ?? null,
      closedAt: cycle.closedAt?.toISOString() ?? null,
      createdAt: cycle.createdAt.toISOString(),
      updatedAt: cycle.updatedAt.toISOString(),
    });
  }
}

export class ErrorDetailDto {
  @ApiProperty({ example: "ROSTER_EMPTY" })
  code!: string;
  @ApiProperty()
  message!: string;
}

export class PublishChecksDto {
  @ApiProperty({
    type: ErrorDetailDto,
    isArray: true,
    description:
      "Each one stops the publish (409 PUBLISH_BLOCKED lists them in `details`)",
  })
  blocking!: ErrorDetail[];
  @ApiProperty({ type: ErrorDetailDto, isArray: true })
  warnings!: ErrorDetail[];

  static from(report: PublishReport): PublishChecksDto {
    return Object.assign(new PublishChecksDto(), report);
  }
}

export class PublishResponseDto extends CycleResponseDto {
  @ApiProperty({
    type: ErrorDetailDto,
    isArray: true,
    description:
      "Published anyway, but worth knowing (a core course with no students yet)",
  })
  warnings!: ErrorDetail[];
}

export class CycleRefDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  courseName!: string;
  @ApiProperty()
  title!: string;
}

/** An event of one of the student's cycles. */
export class UpcomingEventDto extends CycleEventDto {
  @ApiProperty({ type: CycleRefDto })
  cycle!: CycleRefDto;

  static fromEvent(event: CycleEvent, cycle: Cycle): UpcomingEventDto {
    return Object.assign(new UpcomingEventDto(), CycleEventDto.from(event), {
      cycle: { id: cycle.id, courseName: cycle.courseName, title: cycle.title },
    });
  }
}
