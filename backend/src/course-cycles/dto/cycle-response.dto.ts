import { Cycle } from "../domain/cycle.types";

export class CycleResponseDto {
  id!: string;
  courseName!: string;
  title!: string;
  description!: string | null;
  batchYear!: number;
  semester!: number;
  academicYear!: string;
  submissionStartAt!: string;
  submissionDeadline!: string;
  status!: Cycle["status"];
  publishedAt!: string | null;
  closedAt!: string | null;
  createdAt!: string;
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
    response.status = cycle.status;
    response.publishedAt = cycle.publishedAt?.toISOString() ?? null;
    response.closedAt = cycle.closedAt?.toISOString() ?? null;
    response.createdAt = cycle.createdAt.toISOString();
    response.updatedAt = cycle.updatedAt.toISOString();
    return response;
  }
}
