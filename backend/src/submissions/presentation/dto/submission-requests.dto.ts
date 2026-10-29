import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { LinkDto } from "../../../common/links/link.dto";

export const SUBMISSION_LIMITS = { notes: 4000 } as const;

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
  @MaxLength(SUBMISSION_LIMITS.notes)
  notes?: string | null;
}
