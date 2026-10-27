import { ApiProperty } from "@nestjs/swagger";
import { Cycle } from "../domain/cycle.types";

export class CycleResponseDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  courseName!: string;
  @ApiProperty()
  title!: string;
  @ApiProperty({ type: String, nullable: true })
  description!: string | null;
  @ApiProperty()
  batchYear!: number;
  @ApiProperty()
  semester!: number;
  @ApiProperty()
  academicYear!: string;
  @ApiProperty()
  submissionStartAt!: string;
  @ApiProperty()
  submissionDeadline!: string;
  @ApiProperty()
  minTeamSize!: number;
  @ApiProperty()
  maxTeamSize!: number;
  @ApiProperty({ description: "Students change their own teams until then" })
  teamFormationDeadline!: string;
  @ApiProperty({
    description:
      "The owning faculty complete teams until then; also the idea deadline",
  })
  teamCompletionDeadline!: string;
  @ApiProperty({ enum: ["CORE", "ELECTIVE"] })
  kind!: Cycle["kind"];
  @ApiProperty({ enum: ["DRAFT", "PUBLISHED", "CLOSED"] })
  status!: Cycle["status"];
  @ApiProperty({ type: String, nullable: true })
  publishedAt!: string | null;
  @ApiProperty({ type: String, nullable: true })
  closedAt!: string | null;
  @ApiProperty()
  createdAt!: string;
  @ApiProperty()
  updatedAt!: string;

  static fromCycle(cycle: Cycle): CycleResponseDto {
    const response = new CycleResponseDto();
    response.id = cycle.id;
    response.courseName = cycle.courseName;
    response.title = cycle.title;
    response.description = cycle.description;
    response.batchYear = cycle.batchYear;
    response.semester = cycle.semester;
    response.academicYear = cycle.academicYear;
    response.submissionStartAt = cycle.submissionStartAt.toISOString();
    response.submissionDeadline = cycle.submissionDeadline.toISOString();
    response.minTeamSize = cycle.minTeamSize;
    response.maxTeamSize = cycle.maxTeamSize;
    response.teamFormationDeadline = cycle.teamFormationDeadline.toISOString();
    response.teamCompletionDeadline =
      cycle.teamCompletionDeadline.toISOString();
    response.kind = cycle.kind;
    response.status = cycle.status;
    response.publishedAt = cycle.publishedAt?.toISOString() ?? null;
    response.closedAt = cycle.closedAt?.toISOString() ?? null;
    response.createdAt = cycle.createdAt.toISOString();
    response.updatedAt = cycle.updatedAt.toISOString();
    return response;
  }
}
