import type { LinkRequirement } from "../../common/links/link-requirement";
import type { Milestone, MilestoneInput } from "./milestone";

export type CycleStatus = "DRAFT" | "PUBLISHED" | "CLOSED";

export type CycleAction = "PUBLISH" | "CLOSE";

/** CORE: the whole batch takes part. ELECTIVE: only the students the faculty enrolled. */
export type CourseKind = "CORE" | "ELECTIVE";

/** Where ideas come from: teams' own proposals, the faculty's list, or either. */
export type CycleIdeaSource = "STUDENT_PROPOSALS" | "FACULTY_LIST" | "BOTH";

/** Applied when a faculty member leaves the team size out. */
export const DEFAULT_TEAM_SIZE = { min: 1, max: 4 } as const;
/** Largest team any cycle may allow; the database checks it too. */
export const TEAM_SIZE_LIMIT = 10;

/** The cycle aggregate: the cycle and its milestones, in position order. */
export interface Cycle {
  id: string;
  courseName: string;
  title: string;
  description: string | null;
  batchYear: number;
  semester: number;
  academicYear: string;
  minTeamSize: number;
  maxTeamSize: number;
  /** Students change their own teams until this moment; the faculty then place the rest until `ideaDeadline`. */
  teamDeadline: Date;
  /** Teams submit or pick their first idea until this moment; feedback rounds continue after it. */
  ideaDeadline: Date;
  ideaSource: CycleIdeaSource;
  /** Which links an idea needs. */
  ideaLinkRequirement: LinkRequirement;
  milestones: Milestone[];
  kind: CourseKind;
  status: CycleStatus;
  createdByFacultyId: string;
  publishedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** The cycle's own fields when it is created; its milestones are saved with it. */
export interface CycleCreateData {
  courseName: string;
  title: string;
  description: string | null;
  batchYear: number;
  semester: number;
  academicYear: string;
  minTeamSize: number;
  maxTeamSize: number;
  teamDeadline: Date;
  ideaDeadline: Date;
  ideaSource: CycleIdeaSource;
  ideaLinkRequirement: LinkRequirement;
  kind: CourseKind;
  createdByFacultyId: string;
}

/** The dates and team sizes that must stay consistent whenever a cycle is saved. */
export type CycleSchedule = Pick<
  Cycle,
  "minTeamSize" | "maxTeamSize" | "teamDeadline" | "ideaDeadline"
> & { milestones: readonly MilestoneInput[] };

/** The deadlines that each end a stage before the milestones start, in order. */
export type StageDeadline = "teamDeadline" | "ideaDeadline";

export const STAGE_DEADLINES: readonly StageDeadline[] = [
  "teamDeadline",
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
  minTeamSize?: number;
  maxTeamSize?: number;
  teamDeadline?: Date;
  ideaDeadline?: Date;
  ideaSource?: CycleIdeaSource;
  ideaLinkRequirement?: LinkRequirement;
  kind?: CourseKind;
}

/** What an edit may name: the cycle's own fields, or its list of milestones. */
export type EditableField = keyof CyclePatch | "milestones";
