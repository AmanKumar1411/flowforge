export type CycleStatus = "DRAFT" | "PUBLISHED" | "CLOSED";

export type CycleAction = "PUBLISH" | "CLOSE";

/** Applied when a faculty member leaves the team size out. */
export const DEFAULT_TEAM_SIZE = { min: 1, max: 4 } as const;
/** Largest team any cycle may allow; the database checks it too. */
export const TEAM_SIZE_LIMIT = 10;

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
  minTeamSize: number;
  maxTeamSize: number;
  /** After this moment team membership is fixed. Phase 5 uses it for idea submission too. */
  teamFormationDeadline: Date;
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
  minTeamSize: number;
  maxTeamSize: number;
  teamFormationDeadline: Date;
  createdByFacultyId: string;
}

/** The dates and team sizes that must stay consistent whenever a cycle is saved. */
export type CycleSchedule = Pick<
  Cycle,
  | "submissionStartAt"
  | "submissionDeadline"
  | "minTeamSize"
  | "maxTeamSize"
  | "teamFormationDeadline"
>;

export interface CyclePatch {
  courseName?: string;
  title?: string;
  description?: string | null;
  batchYear?: number;
  semester?: number;
  academicYear?: string;
  submissionStartAt?: Date;
  submissionDeadline?: Date;
  minTeamSize?: number;
  maxTeamSize?: number;
  teamFormationDeadline?: Date;
}
