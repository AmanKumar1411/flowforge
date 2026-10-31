import {
  Evaluation,
  GradingMilestone,
  GradingTeam,
  MilestoneGrading,
} from "../domain/evaluation";
import { LatestWork } from "./ports/grading-sources";

/**
 * Marks and the scale. The keys exist only when EVALUATION_MARKS_ENABLED is
 * on (H3): without marks no view carries them, not even as null.
 */
export interface MarksPart {
  marks?: number | null;
  maxMarks?: number | null;
}

/** An evaluation in the faculty's grading table. */
export interface GradingEvaluationView {
  id: string;
  marks?: number | null;
  feedback: string | null;
  version: number;
  updatedAt: Date;
}

/** One row of the faculty's grading table. */
export interface GradingRow {
  team: GradingTeam;
  evaluation: GradingEvaluationView | null;
  /** Null for a team that submitted nothing (flagged in the UI). */
  latestWork: LatestWork | null;
}

/** A milestone's grading, for the owner and admins. */
export interface GradingView {
  milestone: GradingMilestone;
  /** Whether this version gives marks; without, grading is feedback only. */
  marksEnabled: boolean;
  maxMarks?: number | null;
  releasedAt: Date | null;
  /** Whether evaluations can be saved now (from the due date, while published). */
  open: boolean;
  rows: GradingRow[];
}

/** An evaluation as a team (or its faculty) reads it. */
export interface TeamEvaluationView extends MarksPart {
  milestoneId: string;
  feedback: string | null;
  /** Null for the owner's or an admin's view before release. */
  releasedAt: Date | null;
  updatedAt: Date;
  /** Saved again after the release: the team sees "Updated" (S2). */
  updatedAfterRelease: boolean;
}

/** A released evaluation with its team, for the student dashboard. */
export interface MemberEvaluationView extends TeamEvaluationView {
  teamId: string;
}

/** The marks keys of a view that has them; nothing for one that does not. */
export const pickMarks = (view: MarksPart): MarksPart =>
  "marks" in view || "maxMarks" in view
    ? { marks: view.marks ?? null, maxMarks: view.maxMarks ?? null }
    : {};

export const toGradingEvaluation = (
  evaluation: Evaluation,
  marksEnabled: boolean,
): GradingEvaluationView => ({
  id: evaluation.id,
  ...(marksEnabled ? { marks: evaluation.marks } : {}),
  feedback: evaluation.feedback,
  version: evaluation.version,
  updatedAt: evaluation.updatedAt,
});

export const toTeamView = (
  evaluation: Evaluation,
  grading: Pick<MilestoneGrading, "maxMarks" | "releasedAt"> | null,
  updatedAfterRelease: boolean,
  marksEnabled: boolean,
): TeamEvaluationView => ({
  milestoneId: evaluation.milestoneId,
  ...(marksEnabled
    ? { marks: evaluation.marks, maxMarks: grading?.maxMarks ?? null }
    : {}),
  feedback: evaluation.feedback,
  releasedAt: grading?.releasedAt ?? null,
  updatedAt: evaluation.updatedAt,
  updatedAfterRelease,
});
