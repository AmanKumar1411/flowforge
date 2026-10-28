export type CycleStatus = "DRAFT" | "PUBLISHED" | "CLOSED";

export type CycleAction = "PUBLISH" | "CLOSE";

/** CORE: the whole batch takes part. ELECTIVE: only the students the faculty enrolled. */
export type CourseKind = "CORE" | "ELECTIVE";

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
  /** Students change their own teams until this moment. */
  teamFormationDeadline: Date;
  /** The owning faculty complete teams until this moment. */
  teamCompletionDeadline: Date;
  /** Teams submit their first idea until this moment; a rejected idea can be resubmitted until submissionStartAt. */
  ideaDeadline: Date;
  kind: CourseKind;
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
  teamCompletionDeadline: Date;
  ideaDeadline: Date;
  kind: CourseKind;
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
  | "teamCompletionDeadline"
  | "ideaDeadline"
>;

/** The deadlines that each end a stage before submissions open, in order. */
export type StageDeadline =
  "teamFormationDeadline" | "teamCompletionDeadline" | "ideaDeadline";

export const STAGE_DEADLINES: readonly StageDeadline[] = [
  "teamFormationDeadline",
  "teamCompletionDeadline",
  "ideaDeadline",
];

export interface Enrollment {
  /** Normalized; the student may not have signed in yet. */
  email: string;
  createdAt: Date;
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
  minTeamSize?: number;
  maxTeamSize?: number;
  teamFormationDeadline?: Date;
  teamCompletionDeadline?: Date;
  ideaDeadline?: Date;
  kind?: CourseKind;
}
