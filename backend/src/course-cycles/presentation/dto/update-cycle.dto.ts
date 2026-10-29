import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import {
  CourseKind,
  CycleIdeaSource,
  TEAM_SIZE_LIMIT,
} from "../../domain/cycle.types";
import { IDEA_SOURCES } from "./create-cycle.dto";
import { LinkRequirementDto, MilestoneDto } from "./milestone.dto";

const COURSE_KINDS: CourseKind[] = ["CORE", "ELECTIVE"];

export class UpdateCycleDto {
  @ApiPropertyOptional({ example: "Software Design & System Development" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  courseName?: string;

  @ApiPropertyOptional({ example: "2026 Software Development Projects" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ example: "The first project cycle." })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ example: 2026 })
  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(3000)
  batchYear?: number;

  @ApiPropertyOptional({ example: 7, minimum: 1, maximum: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  semester?: number;

  @ApiPropertyOptional({ example: "2026-27" })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  academicYear?: string;

  @ApiPropertyOptional({ example: 2, minimum: 1, maximum: TEAM_SIZE_LIMIT })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(TEAM_SIZE_LIMIT)
  minTeamSize?: number;

  @ApiPropertyOptional({ example: 4, minimum: 1, maximum: TEAM_SIZE_LIMIT })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(TEAM_SIZE_LIMIT)
  maxTeamSize?: number;

  @ApiPropertyOptional({
    example: "2026-11-04T18:29:00.000Z",
    description:
      "On a published cycle, editable only while team formation is open, and only to a future time.",
  })
  @IsOptional()
  @IsISO8601()
  teamDeadline?: string;

  @ApiPropertyOptional({
    example: "2026-11-11T18:29:00.000Z",
    description:
      "On a published cycle, editable only before it passes, and only to a future time.",
  })
  @IsOptional()
  @IsISO8601()
  ideaDeadline?: string;

  @ApiPropertyOptional({ enum: IDEA_SOURCES, description: "Drafts only." })
  @IsOptional()
  @IsIn(IDEA_SOURCES)
  ideaSource?: CycleIdeaSource;

  @ApiPropertyOptional({
    type: LinkRequirementDto,
    description: "Drafts only.",
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => LinkRequirementDto)
  ideaLinkRequirement?: LinkRequirementDto;

  @ApiPropertyOptional({
    enum: COURSE_KINDS,
    description:
      "CORE: the whole batch. ELECTIVE: only students on the enrollment list. Fixed once published.",
  })
  @IsOptional()
  @IsIn(COURSE_KINDS)
  kind?: CourseKind;

  @ApiPropertyOptional({
    type: MilestoneDto,
    isArray: true,
    description:
      "The full list, in order: items with an id keep that milestone, new items have none, and left-out milestones are removed (drafts only). Once published the list keeps its milestones and order (409 MILESTONES_LOCKED), and only a milestone that has not opened may change its dates and description, to the future (409 MILESTONE_LOCKED).",
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MilestoneDto)
  milestones?: MilestoneDto[];
}
