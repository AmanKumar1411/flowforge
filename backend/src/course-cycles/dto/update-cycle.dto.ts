import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";

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

  @ApiPropertyOptional({ example: "2026-10-01T09:00:00.000Z" })
  @IsOptional()
  @IsISO8601()
  submissionStartAt?: string;

  @ApiPropertyOptional({ example: "2026-12-01T17:00:00.000Z" })
  @IsOptional()
  @IsISO8601()
  submissionDeadline?: string;
}
