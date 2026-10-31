import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { pickMarks } from "../../../evaluations/application/evaluation-views";
import {
  CycleEventDto,
  CycleStageDto,
} from "../../../course-cycles/presentation/dto/cycle-response.dto";
import {
  CycleSummary,
  ProjectCard,
  StudentDashboard,
  UpNextItem,
} from "../../application/dashboard-views";

class CycleSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() courseName!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: ["CORE", "ELECTIVE"] }) kind!: CycleSummary["kind"];
  @ApiProperty({ enum: ["DRAFT", "PUBLISHED", "CLOSED"] })
  status!: CycleSummary["status"];
}

class UpNextActionDto {
  @ApiProperty({ enum: ["team", "idea", "milestones"] }) tab!: string;
  @ApiProperty({ description: "False when only the leader can act" })
  actionable!: boolean;
}

class UpNextDto {
  @ApiProperty({ type: CycleSummaryDto }) cycle!: CycleSummaryDto;
  @ApiProperty({
    description: "A to-do kind (JOIN_TEAM…) or an event kind (TEAM_DEADLINE…)",
  })
  kind!: string;
  @ApiProperty({ type: String, nullable: true }) at!: string | null;
  @ApiProperty() text!: string;
  @ApiPropertyOptional({ type: UpNextActionDto }) action?: UpNextActionDto;
}

class UpdateDto {
  @ApiProperty({ type: CycleSummaryDto }) cycle!: CycleSummaryDto;
  @ApiProperty({
    enum: [
      "JOINED_TEAM",
      "IDEA_APPROVED",
      "IDEA_REJECTED",
      "RESULTS_RELEASED",
      "RESULTS_UPDATED",
    ],
  })
  kind!: string;
  @ApiProperty() at!: string;
  @ApiProperty() text!: string;
  @ApiProperty({ enum: ["team", "idea", "milestones"] }) tab!: string;
}

class ResultDto {
  @ApiProperty() milestoneId!: string;
  @ApiProperty() label!: string;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: "Present only when marks are enabled",
  })
  marks?: number | null;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: "Present only when marks are enabled",
  })
  maxMarks?: number | null;
  @ApiProperty({ type: String, nullable: true }) feedback!: string | null;
  @ApiProperty() releasedAt!: string;
  @ApiProperty() updatedAfterRelease!: boolean;
}

class MyTeamDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() memberCount!: number;
}

class ProjectCardDto {
  @ApiProperty({ type: CycleSummaryDto }) cycle!: CycleSummaryDto;
  @ApiProperty({ type: CycleStageDto }) currentStage!: CycleStageDto;
  @ApiProperty({ type: CycleEventDto, nullable: true })
  nextEvent!: CycleEventDto | null;
  @ApiProperty({ type: MyTeamDto, nullable: true }) myTeam!: MyTeamDto | null;
  @ApiProperty({ enum: ["LEADER", "MEMBER", "NO_TEAM"] })
  myRole!: ProjectCard["myRole"];
  @ApiProperty({ type: String, nullable: true }) todo!: string | null;
  @ApiProperty({ type: ResultDto, isArray: true }) results!: ResultDto[];
}

class ProjectsDto {
  @ApiProperty({ type: ProjectCardDto, isArray: true })
  active!: ProjectCardDto[];
  @ApiProperty({ type: ProjectCardDto, isArray: true }) past!: ProjectCardDto[];
}

const upNext = (item: UpNextItem) => ({
  ...item,
  at: item.at?.toISOString() ?? null,
});

const card = (project: ProjectCard): ProjectCardDto => ({
  cycle: project.cycle,
  currentStage: CycleStageDto.from(project.currentStage),
  nextEvent: project.nextEvent && CycleEventDto.from(project.nextEvent),
  myTeam: project.myTeam,
  myRole: project.myRole,
  todo: project.todo,
  results: project.results.map((result) => ({
    milestoneId: result.milestone.id,
    label: `M${result.milestone.position} · ${result.milestone.name}`,
    ...pickMarks(result),
    feedback: result.feedback,
    releasedAt: result.releasedAt.toISOString(),
    updatedAfterRelease: result.updatedAfterRelease,
  })),
});

export class StudentDashboardDto {
  @ApiProperty({
    type: UpNextDto,
    isArray: true,
    description: "At most 10: things to do first, then dates",
  })
  upNext!: UpNextDto[];
  @ApiProperty({
    type: UpdateDto,
    isArray: true,
    description: "At most 20, newest first",
  })
  updates!: UpdateDto[];
  @ApiProperty({ type: ProjectsDto }) projects!: ProjectsDto;

  static from(dashboard: StudentDashboard): StudentDashboardDto {
    return Object.assign(new StudentDashboardDto(), {
      upNext: dashboard.upNext.map(upNext),
      updates: dashboard.updates.map((update) => ({
        ...update,
        at: update.at.toISOString(),
      })),
      projects: {
        active: dashboard.projects.active.map(card),
        past: dashboard.projects.past.map(card),
      },
    });
  }
}
