import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
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
  DEFAULT_TEAM_SIZE,
  TEAM_SIZE_LIMIT,
} from "../../domain/cycle.types";
import { CreateCycleCommand } from "../../application/cycle-commands";
import { LinkRequirementDto, MilestoneDto } from "./milestone.dto";

const COURSE_KINDS: CourseKind[] = ["CORE", "ELECTIVE"];
export const IDEA_SOURCES: CycleIdeaSource[] = [
  "STUDENT_PROPOSALS",
  "FACULTY_LIST",
  "BOTH",
];

export class CreateCycleDto implements CreateCycleCommand {
  @ApiProperty({ example: "Software Design & System Development" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  courseName!: string;

  @ApiProperty({ example: "2026 Software Development Projects" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title!: string;

  @ApiPropertyOptional({ example: "The first project cycle." })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ example: 2026 })
  @IsInt()
  @Min(1900)
  @Max(3000)
  batchYear!: number;

  @ApiProperty({ example: 7, minimum: 1, maximum: 12 })
  @IsInt()
  @Min(1)
  @Max(12)
  semester!: number;

  @ApiProperty({ example: "2026-27" })
  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  academicYear!: string;

  @ApiPropertyOptional({
    example: 2,
    minimum: 1,
    maximum: TEAM_SIZE_LIMIT,
    default: DEFAULT_TEAM_SIZE.min,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(TEAM_SIZE_LIMIT)
  minTeamSize?: number;

  @ApiPropertyOptional({
    example: 4,
    minimum: 1,
    maximum: TEAM_SIZE_LIMIT,
    default: DEFAULT_TEAM_SIZE.max,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(TEAM_SIZE_LIMIT)
  maxTeamSize?: number;

  @ApiProperty({
    example: "2026-11-04T18:29:00.000Z",
    description:
      "Students change their own teams until then; the owning faculty then place students without a team until ideaDeadline.",
  })
  @IsISO8601()
  teamDeadline!: string;

  @ApiProperty({
    example: "2026-11-11T18:29:00.000Z",
    description:
      "Strictly after teamDeadline. Teams pick or propose their first idea until then; feedback rounds continue after it. The first milestone opens at or after it.",
  })
  @IsISO8601()
  ideaDeadline!: string;

  @ApiPropertyOptional({
    enum: IDEA_SOURCES,
    default: "BOTH",
    description:
      "Where ideas come from: teams' own proposals, the faculty's list, or either. Fixed once published.",
  })
  @IsOptional()
  @IsIn(IDEA_SOURCES)
  ideaSource?: CycleIdeaSource;

  @ApiPropertyOptional({
    type: LinkRequirementDto,
    description:
      'The links an idea needs. Defaults to { required: [], optional: ["GITHUB", "DRIVE"] }. Fixed once published.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => LinkRequirementDto)
  ideaLinkRequirement?: LinkRequirementDto;

  @ApiPropertyOptional({
    enum: COURSE_KINDS,
    default: "CORE",
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
      "M1…Mn in order, saved with the cycle in one transaction. A draft may have none; publishing needs 1 to 10.",
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MilestoneDto)
  milestones?: MilestoneDto[];
}
