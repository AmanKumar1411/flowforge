import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, IsUrl, MaxLength } from "class-validator";

export const SUBMISSION_LIMITS = { url: 500, notes: 4000 } as const;

const HTTP_URL = { protocols: ["http", "https"], require_protocol: true };

export class SubmitWorkDto {
  @ApiProperty({
    example: "https://github.com/nimbus/room-finder",
    description: "Where the code lives (http or https)",
  })
  @IsUrl(HTTP_URL)
  @MaxLength(SUBMISSION_LIMITS.url)
  repositoryUrl!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "A running demo",
  })
  @IsOptional()
  @IsUrl(HTTP_URL)
  @MaxLength(SUBMISSION_LIMITS.url)
  demoUrl?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "A report, slides or video",
  })
  @IsOptional()
  @IsUrl(HTTP_URL)
  @MaxLength(SUBMISSION_LIMITS.url)
  reportUrl?: string | null;

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
