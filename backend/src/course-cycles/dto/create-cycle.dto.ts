import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
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
}
