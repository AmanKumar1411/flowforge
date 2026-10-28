import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  Min,
} from "class-validator";
import type { IdeaDecision } from "../../domain/idea";

export const IDEA_LIMITS = {
  title: 120,
  problem: 2000,
  solution: 4000,
  link: 500,
  feedback: 2000,
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
    type: String,
    nullable: true,
    example: "https://github.com/team/lost-and-found",
    description: "A repository, document or demo (http or https)",
  })
  @IsOptional()
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  @MaxLength(IDEA_LIMITS.link)
  link?: string | null;
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
