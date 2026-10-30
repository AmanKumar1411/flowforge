import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { LinkRequirementShape } from "../../../common/links/link-requirement";
import { LINK_TYPES, LinkType } from "../../../common/links/link-type";
import { MilestoneCommand } from "../../application/cycle-commands";

/** Which links are required and which are optional; any other type is not allowed. */
export class LinkRequirementDto implements LinkRequirementShape {
  @ApiProperty({ enum: LINK_TYPES, isArray: true, example: ["GITHUB"] })
  @IsArray()
  @IsIn(LINK_TYPES, { each: true })
  required!: LinkType[];

  @ApiProperty({ enum: LINK_TYPES, isArray: true, example: ["DEMO", "REPORT"] })
  @IsArray()
  @IsIn(LINK_TYPES, { each: true })
  optional!: LinkType[];
}

export class MilestoneDto implements MilestoneCommand {
  @ApiPropertyOptional({
    description:
      "An existing milestone's id, to keep it (and its submissions). Leave out for a new milestone.",
  })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ example: "Design review", maxLength: 80 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 2000,
    description: "Left out on an existing milestone: unchanged.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiProperty({ example: "2026-11-13T18:30:00.000Z" })
  @IsISO8601()
  submissionOpensAt!: string;

  @ApiProperty({
    example: "2026-11-27T18:29:00.000Z",
    description: "Versions are accepted strictly before this moment.",
  })
  @IsISO8601()
  submissionDueAt!: string;

  @ApiProperty({
    example: "2026-11-28T09:00:00.000Z",
    description: "At or after the due date.",
  })
  @IsISO8601()
  evaluationAt!: string;

  @ApiPropertyOptional({
    type: LinkRequirementDto,
    description:
      'Defaults to { required: ["GITHUB"], optional: ["DEMO", "REPORT"] }; left out on an existing milestone: unchanged.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => LinkRequirementDto)
  linkRequirement?: LinkRequirementDto;
}
