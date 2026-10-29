import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
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
} from "class-validator";
import {
  CourseKind,
  DEFAULT_TEAM_SIZE,
  TEAM_SIZE_LIMIT,
} from "../domain/cycle.types";

const COURSE_KINDS: CourseKind[] = ["CORE", "ELECTIVE"];

export class CreateCycleDto {
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

  @ApiProperty({ example: "2026-10-01T09:00:00.000Z" })
  @IsISO8601()
  submissionStartAt!: string;

  @ApiProperty({ example: "2026-12-01T17:00:00.000Z" })
  @IsISO8601()
  submissionDeadline!: string;

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

  @ApiPropertyOptional({
    example: "2026-10-20T17:00:00.000Z",
    description:
      "When team membership becomes fixed for students. Defaults to submissionStartAt.",
  })
  @IsOptional()
  @IsISO8601()
  teamFormationDeadline?: string;

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
    example: "2026-10-25T17:00:00.000Z",
    type: String,
    nullable: true,
    description:
      "The owning faculty place students without a team until then; it must come after teamFormationDeadline. Null or left out: no faculty window (stored equal to teamFormationDeadline). Must be by submissionStartAt.",
  })
  @IsOptional()
  @IsISO8601()
  teamCompletionDeadline?: string | null;

  @ApiPropertyOptional({
    example: "2026-10-28T17:00:00.000Z",
    description:
      "Teams pick or propose their first idea until then; after a rejection they revise until the cycle closes. Defaults to teamCompletionDeadline. Must be between it and submissionStartAt.",
  })
  @IsOptional()
  @IsISO8601()
  ideaDeadline?: string;
}
