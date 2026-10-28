import { ApiProperty } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  MaxLength,
} from "class-validator";
import {
  BatchImportResult,
  BatchStudent,
  EnrolledStudent,
  EnrollmentResult,
} from "../cycle-enrollment.service";

export const ENROLLMENT_IMPORT_LIMIT = 500;

export class AddEnrollmentsDto {
  @ApiProperty({
    type: [String],
    example: ["neha.t26csai@nst.rishihood.edu.in"],
    description: `Student emails, e.g. read from a CSV; up to ${ENROLLMENT_IMPORT_LIMIT}. Invalid rows are reported, not fatal.`,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(ENROLLMENT_IMPORT_LIMIT)
  @IsString({ each: true })
  @MaxLength(254, { each: true })
  emails!: string[];
}

export class EnrolledStudentDto {
  @ApiProperty()
  email!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "Null only for an email enrolled before accounts were pre-registered; enrolling it again registers it",
  })
  userId!: string | null;
  @ApiProperty({ type: String, nullable: true })
  name!: string | null;
  @ApiProperty({ description: "False until the student first signs in" })
  signedIn!: boolean;
  @ApiProperty()
  enrolledAt!: string;

  static from(student: EnrolledStudent): EnrolledStudentDto {
    return Object.assign(new EnrolledStudentDto(), {
      ...student,
      enrolledAt: student.enrolledAt.toISOString(),
    });
  }
}

class RejectedEmailDto {
  @ApiProperty()
  email!: string;
  @ApiProperty()
  reason!: string;
}

export class EnrollmentResultDto {
  @ApiProperty({ type: [String] })
  added!: string[];
  @ApiProperty({ type: [String] })
  alreadyEnrolled!: string[];
  @ApiProperty({ type: RejectedEmailDto, isArray: true })
  rejected!: RejectedEmailDto[];

  static from(result: EnrollmentResult): EnrollmentResultDto {
    return Object.assign(new EnrollmentResultDto(), result);
  }
}

export class BatchStudentDto {
  @ApiProperty()
  userId!: string;
  @ApiProperty()
  email!: string;
  @ApiProperty({
    description: "From the email until the student first signs in",
  })
  name!: string;
  @ApiProperty({ description: "False until the student first signs in" })
  signedIn!: boolean;

  static from(student: BatchStudent): BatchStudentDto {
    return Object.assign(new BatchStudentDto(), student);
  }
}

export class BatchImportResultDto {
  @ApiProperty({
    type: [String],
    description: "Accounts created now, waiting for the first sign-in",
  })
  registered!: string[];
  @ApiProperty({ type: [String] })
  alreadyRegistered!: string[];
  @ApiProperty({ type: RejectedEmailDto, isArray: true })
  rejected!: RejectedEmailDto[];

  static from(result: BatchImportResult): BatchImportResultDto {
    return Object.assign(new BatchImportResultDto(), result);
  }
}
