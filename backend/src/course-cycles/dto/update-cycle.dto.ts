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
  @IsOptional()
  @IsString()
  @MaxLength(120)
  courseName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(3000)
  batchYear?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  semester?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  academicYear?: string;

  @IsOptional()
  @IsISO8601()
  submissionStartAt?: string;

  @IsOptional()
  @IsISO8601()
  submissionDeadline?: string;
}
