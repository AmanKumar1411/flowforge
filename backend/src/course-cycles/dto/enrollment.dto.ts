import { ApiProperty } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  MaxLength,
} from "class-validator";
import { EnrolledStudent, EnrollmentResult } from "../cycle-enrollment.service";

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
    description: "Null until the student first signs in",
  })
  userId!: string | null;
  @ApiProperty({ type: String, nullable: true })
  name!: string | null;
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
