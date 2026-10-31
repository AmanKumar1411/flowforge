import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { SaveEvaluationCommand } from "../../application/evaluation-commands";
import {
  GradingView,
  pickMarks,
  TeamEvaluationView,
} from "../../application/evaluation-views";
import { MAX_MARKS_LIMIT } from "../../domain/evaluation-rules";
import { IsCleanText } from "../../../common/validation/clean-text";

export class MaxMarksDto {
  @ApiProperty({ example: 20, minimum: 1, maximum: MAX_MARKS_LIMIT })
  @IsInt()
  @Min(1)
  @Max(MAX_MARKS_LIMIT)
  maxMarks!: number;
}

export class SaveEvaluationDto implements SaveEvaluationCommand {
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    example: 14.5,
    description:
      "0 to maxMarks, at most 2 decimals. Only when EVALUATION_MARKS_ENABLED; otherwise 400 MARKS_DISABLED and feedback is required.",
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  marks?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 4000 })
  @IsOptional()
  @IsString()
  @IsCleanText()
  @MaxLength(4000)
  feedback?: string | null;

  @ApiPropertyOptional({
    description:
      "The version you read. Required once the evaluation exists; a different one is 409 EVALUATION_CHANGED.",
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedVersion?: number;
}

class GradingTeamDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() memberCount!: number;
}

const MARKS_ONLY = "Present only when marks are enabled";

class GradingEvaluationDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: MARKS_ONLY,
  })
  marks?: number | null;
  @ApiProperty({ type: String, nullable: true }) feedback!: string | null;
  @ApiProperty({ description: "Send it back as expectedVersion when saving" })
  version!: number;
  @ApiProperty() updatedAt!: string;
}

class LatestWorkDto {
  @ApiProperty() version!: number;
  @ApiProperty() submittedAt!: string;
}

class GradingRowDto {
  @ApiProperty({ type: GradingTeamDto }) team!: GradingTeamDto;
  @ApiProperty({ type: GradingEvaluationDto, nullable: true })
  evaluation!: GradingEvaluationDto | null;
  @ApiProperty({
    type: LatestWorkDto,
    nullable: true,
    description: "Null: the team submitted nothing",
  })
  latestWork!: LatestWorkDto | null;
}

class GradingMilestoneDto {
  @ApiProperty() id!: string;
  @ApiProperty() position!: number;
  @ApiProperty() name!: string;
  @ApiProperty() submissionDueAt!: string;
}

export class GradingDto {
  @ApiProperty({ type: GradingMilestoneDto }) milestone!: GradingMilestoneDto;
  @ApiProperty({
    description: "Whether this version gives marks; otherwise feedback only",
  })
  marksEnabled!: boolean;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: MARKS_ONLY,
  })
  maxMarks?: number | null;
  @ApiProperty({ type: String, nullable: true }) releasedAt!: string | null;
  @ApiProperty({
    description:
      "Marks can be given now: from the due date while the project is published",
  })
  open!: boolean;
  @ApiProperty({ type: GradingRowDto, isArray: true }) rows!: GradingRowDto[];

  static from(view: GradingView): GradingDto {
    return Object.assign(new GradingDto(), {
      milestone: {
        id: view.milestone.id,
        position: view.milestone.position,
        name: view.milestone.name,
        submissionDueAt: view.milestone.submissionDueAt.toISOString(),
      },
      marksEnabled: view.marksEnabled,
      ...("maxMarks" in view ? { maxMarks: view.maxMarks } : {}),
      releasedAt: view.releasedAt?.toISOString() ?? null,
      open: view.open,
      rows: view.rows.map(({ team, evaluation, latestWork }) => ({
        team: {
          id: team.id,
          name: team.name,
          memberCount: team.memberIds.length,
        },
        evaluation: evaluation && {
          id: evaluation.id,
          ...("marks" in evaluation ? { marks: evaluation.marks } : {}),
          feedback: evaluation.feedback,
          version: evaluation.version,
          updatedAt: evaluation.updatedAt.toISOString(),
        },
        latestWork: latestWork && {
          version: latestWork.version,
          submittedAt: latestWork.submittedAt.toISOString(),
        },
      })),
    });
  }
}

export class TeamEvaluationDto {
  @ApiProperty() milestoneId!: string;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: MARKS_ONLY,
  })
  marks?: number | null;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: MARKS_ONLY,
  })
  maxMarks?: number | null;
  @ApiProperty({ type: String, nullable: true }) feedback!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: "When the results were released",
  })
  releasedAt!: string | null;
  @ApiProperty() updatedAt!: string;
  @ApiProperty({ description: 'Changed after the release: shown as "Updated"' })
  updatedAfterRelease!: boolean;

  static from(view: TeamEvaluationView): TeamEvaluationDto {
    return Object.assign(new TeamEvaluationDto(), {
      milestoneId: view.milestoneId,
      ...pickMarks(view),
      feedback: view.feedback,
      releasedAt: view.releasedAt?.toISOString() ?? null,
      updatedAt: view.updatedAt.toISOString(),
      updatedAfterRelease: view.updatedAfterRelease,
    });
  }
}
