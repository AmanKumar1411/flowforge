import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { LinkDto } from "../../../common/links/link.dto";
import type { IdeaDecision } from "../../domain/idea";

export const IDEA_LIMITS = {
  title: 120,
  problem: 2000,
  solution: 4000,
  link: 500,
  feedback: 2000,
  description: 4000,
} as const;

const DECISIONS: IdeaDecision[] = ["APPROVED", "REJECTED"];

export class SubmitIdeaDto {
  @ApiProperty({
    example: "Campus lost-and-found",
    maxLength: IDEA_LIMITS.title,
  })
  @IsString()
  @Matches(/\S/, { message: "title must not be blank" })
  @MaxLength(IDEA_LIMITS.title)
  title!: string;

  @ApiProperty({
    description: "The problem the team wants to solve",
    maxLength: IDEA_LIMITS.problem,
  })
  @IsString()
  @Matches(/\S/, { message: "problem must not be blank" })
  @MaxLength(IDEA_LIMITS.problem)
  problem!: string;

  @ApiProperty({
    description: "How the team plans to solve it",
    maxLength: IDEA_LIMITS.solution,
  })
  @IsString()
  @Matches(/\S/, { message: "solution must not be blank" })
  @MaxLength(IDEA_LIMITS.solution)
  solution!: string;

  @ApiPropertyOptional({
    type: LinkDto,
    isArray: true,
    description:
      "Checked against the cycle's idea link requirement (by default GitHub and Drive are optional): 400 MISSING_REQUIRED_LINK, LINK_NOT_ALLOWED or INVALID_LINK. An empty url means none.",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => LinkDto)
  links?: LinkDto[];
}

export class ReviewIdeaDto {
  @ApiProperty({
    description:
      "The version you read; if the team changed the idea since, the review is refused (409 IDEA_CHANGED)",
    example: 1,
  })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiProperty({ enum: DECISIONS })
  @IsIn(DECISIONS)
  decision!: IdeaDecision;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: IDEA_LIMITS.feedback,
    description: "Required for a rejection",
  })
  @IsOptional()
  @IsString()
  @MaxLength(IDEA_LIMITS.feedback)
  feedback?: string | null;
}

export class PickIdeaDto {
  @ApiProperty({ description: "An idea from the cycle's catalog" })
  @IsUUID()
  catalogIdeaId!: string;
}

export class CatalogIdeaRequestDto {
  @ApiProperty({ example: "Library seat finder", maxLength: IDEA_LIMITS.title })
  @IsString()
  @Matches(/\S/, { message: "title must not be blank" })
  @MaxLength(IDEA_LIMITS.title)
  title!: string;

  @ApiProperty({
    description: "What the project is about and what the faculty expect",
    maxLength: IDEA_LIMITS.description,
  })
  @IsString()
  @Matches(/\S/, { message: "description must not be blank" })
  @MaxLength(IDEA_LIMITS.description)
  description!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "A brief, dataset or reference (http or https)",
  })
  @IsOptional()
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  @MaxLength(IDEA_LIMITS.link)
  link?: string | null;
}
