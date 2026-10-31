import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { LinkDto } from "../../../common/links/link.dto";
import { IsCleanText } from "../../../common/validation/clean-text";

export const SUBMISSION_LIMITS = { notes: 4000 } as const;

/** Without `limit`, a page holds as many versions as a team may submit, so it is the whole history. */
export const HISTORY_PAGE_DEFAULT = 50;

export class SubmissionHistoryQueryDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: 100,
    default: HISTORY_PAGE_DEFAULT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description:
      "Only versions older than this one: the last version of the previous page",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  before?: number;
}

export class SubmitWorkDto {
  @ApiProperty({
    type: LinkDto,
    isArray: true,
    description:
      "Checked against the milestone's link requirement: 400 MISSING_REQUIRED_LINK, LINK_NOT_ALLOWED, or INVALID_LINK (a bad URL, or one type twice). An empty url means none.",
  })
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => LinkDto)
  links!: LinkDto[];

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: SUBMISSION_LIMITS.notes,
    description: "What changed in this version, how to run it",
  })
  @IsOptional()
  @IsString()
  @IsCleanText()
  @MaxLength(SUBMISSION_LIMITS.notes)
  notes?: string | null;
}
