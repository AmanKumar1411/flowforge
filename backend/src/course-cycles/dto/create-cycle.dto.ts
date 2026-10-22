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
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  courseName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsInt()
  @Min(1900)
  @Max(3000)
  batchYear!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  semester!: number;

  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  academicYear!: string;

  @IsISO8601()
  submissionStartAt!: string;

  @IsISO8601()
  submissionDeadline!: string;
}
