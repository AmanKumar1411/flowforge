export type CycleStatus = "DRAFT" | "PUBLISHED" | "CLOSED";

export type CycleAction = "PUBLISH" | "CLOSE";

export interface Cycle {
  id: string;
  courseName: string;
  title: string;
  description: string | null;
  batchYear: number;
  semester: number;
  academicYear: string;
  submissionStartAt: Date;
  submissionDeadline: Date;
  status: CycleStatus;
  createdByFacultyId: string;
  publishedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CycleCreateData {
  courseName: string;
  title: string;
  description: string | null;
  batchYear: number;
  semester: number;
  academicYear: string;
  submissionStartAt: Date;
  submissionDeadline: Date;
  createdByFacultyId: string;
}

export interface CyclePatch {
  courseName?: string;
  title?: string;
  description?: string | null;
  batchYear?: number;
  semester?: number;
  academicYear?: string;
  submissionStartAt?: Date;
  submissionDeadline?: Date;
}
