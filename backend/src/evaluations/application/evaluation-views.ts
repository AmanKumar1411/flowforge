import {
  Evaluation,
  GradingMilestone,
  GradingTeam,
  MilestoneGrading,
} from "../domain/evaluation";
import { LatestWork } from "./ports/grading-sources";

/** One row of the faculty's grading table. */
export interface GradingRow {
  team: GradingTeam;
  evaluation: Evaluation | null;
  /** Null for a team that submitted nothing (flagged in the UI). */
  latestWork: LatestWork | null;
}

/** A milestone's grading, for the owner and admins. */
export interface GradingView {
  milestone: GradingMilestone;
  maxMarks: number | null;
  releasedAt: Date | null;
  /** Whether marks can be given now (from the due date, while published). */
  open: boolean;
  rows: GradingRow[];
}

/** An evaluation as a team (or its faculty) reads it. */
export interface TeamEvaluationView {
  milestoneId: string;
  marks: number | null;
  maxMarks: number | null;
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

export const toTeamView = (
  evaluation: Evaluation,
  grading: Pick<MilestoneGrading, "maxMarks" | "releasedAt"> | null,
  updatedAfterRelease: boolean,
): TeamEvaluationView => ({
  milestoneId: evaluation.milestoneId,
  marks: evaluation.marks,
  maxMarks: grading?.maxMarks ?? null,
  feedback: evaluation.feedback,
  releasedAt: grading?.releasedAt ?? null,
  updatedAt: evaluation.updatedAt,
  updatedAfterRelease,
});
