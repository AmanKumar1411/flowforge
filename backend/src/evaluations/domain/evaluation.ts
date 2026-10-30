import type { Role } from "../../auth/domain/role";
import type { Cycle } from "../../course-cycles/domain/cycle.types";
import type { Milestone } from "../../course-cycles/domain/milestone";

/** A milestone's grading settings: the scale and when results were released to every team (S2, S3). */
export interface MilestoneGrading {
  milestoneId: string;
  /** Marks are out of this; null until set (feedback-only grading needs none). */
  maxMarks: number | null;
  releasedAt: Date | null;
  releasedById: string | null;
}

/** One team's mark and feedback for one milestone (S1). Every save is a new version. */
export interface Evaluation {
  id: string;
  milestoneId: string;
  teamId: string;
  cycleId: string;
  marks: number | null;
  feedback: string | null;
  /** 1 for the first save, one more for every change. */
  version: number;
  evaluatedById: string;
  createdAt: Date;
  updatedAt: Date;
}

/** What the faculty write for a team. */
export interface EvaluationInput {
  marks: number | null;
  feedback: string | null;
}

export type EvaluationActor = { id: string; role: Role };

/** The part of a cycle the evaluation rules need. */
export type GradingCycle = Pick<
  Cycle,
  "id" | "status" | "createdByFacultyId" | "milestones"
>;

export type GradingMilestone = Pick<
  Milestone,
  "id" | "position" | "name" | "submissionDueAt"
>;

/** The part of a team the evaluation rules need. */
export interface GradingTeam {
  id: string;
  cycleId: string;
  name: string;
  memberIds: string[];
}
