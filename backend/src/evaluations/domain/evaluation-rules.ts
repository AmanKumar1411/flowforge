import { EvaluationDomainError } from "./evaluation.errors";
import {
  Evaluation,
  EvaluationInput,
  GradingCycle,
  GradingMilestone,
  MilestoneGrading,
} from "./evaluation";

/** Largest scale a milestone may use; the database checks it too. */
export const MAX_MARKS_LIMIT = 1000;

const label = (milestone: GradingMilestone) =>
  `M${milestone.position} · ${milestone.name}`;

/**
 * The grading rules of a milestone, free of I/O (ADR 020). The owning
 * faculty grade a milestone from its due date while the cycle is published,
 * out of an optional scale; each save is a new version, and a save based on
 * an older version is refused. Results reach the teams when the faculty
 * release the milestone, all teams at once and for good.
 */
export class EvaluationRules {
  /** The cycle's milestone, or MILESTONE_NOT_FOUND. */
  milestoneOf(cycle: GradingCycle, milestoneId: string): GradingMilestone {
    const milestone = cycle.milestones.find((m) => m.id === milestoneId);
    if (!milestone) {
      throw new EvaluationDomainError(
        "MILESTONE_NOT_FOUND",
        "This project has no such milestone",
      );
    }
    return milestone;
  }

  isGradingOpen(
    cycle: GradingCycle,
    milestone: GradingMilestone,
    now: Date,
  ): boolean {
    return cycle.status === "PUBLISHED" && milestone.submissionDueAt <= now;
  }

  /** Marks, feedback and release: from the milestone's due date until the cycle closes. */
  assertGradingOpen(
    cycle: GradingCycle,
    milestone: GradingMilestone,
    now: Date,
  ): void {
    if (cycle.status !== "PUBLISHED") {
      throw new EvaluationDomainError(
        "GRADING_CLOSED",
        "Only a published project that is not closed can be graded",
      );
    }
    if (now < milestone.submissionDueAt) {
      throw new EvaluationDomainError(
        "GRADING_NOT_OPEN",
        `${label(milestone)} can be graded from its due date, ${milestone.submissionDueAt.toISOString()}`,
      );
    }
  }

  /** The scale can be set any time before the cycle closes, but never below a mark already given. */
  checkMaxMarks(
    cycle: GradingCycle,
    maxMarks: number,
    highestMark: number | null,
    marksEnabled: boolean,
  ): number {
    if (!marksEnabled) throw this.marksDisabled();
    if (cycle.status === "CLOSED") {
      throw new EvaluationDomainError(
        "GRADING_CLOSED",
        "The project is closed; its grading can no longer change",
      );
    }
    if (
      !Number.isInteger(maxMarks) ||
      maxMarks < 1 ||
      maxMarks > MAX_MARKS_LIMIT
    ) {
      throw new EvaluationDomainError(
        "INVALID_MAX_MARKS",
        `Marks are out of a whole number from 1 to ${MAX_MARKS_LIMIT}`,
      );
    }
    if (highestMark !== null && maxMarks < highestMark) {
      throw new EvaluationDomainError(
        "MAX_MARKS_BELOW_EXISTING",
        `A team already has ${highestMark}; the maximum cannot go below it`,
      );
    }
    return maxMarks;
  }

  /**
   * Trimmed feedback; marks within the scale, at most 2 decimals; something
   * must be given. Without marks (the default, H3), feedback is required and
   * any mark is refused.
   */
  clean(
    input: EvaluationInput,
    grading: MilestoneGrading | null,
    marksEnabled: boolean,
  ): EvaluationInput {
    const feedback = input.feedback?.trim() || null;
    const { marks } = input;
    if (!marksEnabled) {
      if (marks !== null) throw this.marksDisabled();
      if (feedback === null) {
        throw new EvaluationDomainError(
          "EMPTY_EVALUATION",
          "Write feedback for the team",
        );
      }
      return { marks: null, feedback };
    }
    if (marks === null && feedback === null) {
      throw new EvaluationDomainError(
        "EMPTY_EVALUATION",
        "Give marks, feedback, or both",
      );
    }
    if (marks !== null) {
      const max = grading?.maxMarks ?? null;
      if (max === null) {
        throw new EvaluationDomainError(
          "MAX_MARKS_NOT_SET",
          "Set what this milestone is marked out of before giving marks",
        );
      }
      if (
        !Number.isFinite(marks) ||
        marks < 0 ||
        marks > max ||
        Math.round(marks * 100) !== marks * 100
      ) {
        throw new EvaluationDomainError(
          "INVALID_MARKS",
          `Marks go from 0 to ${max}, with at most 2 decimals`,
        );
      }
    }
    return { marks, feedback };
  }

  /**
   * Optimistic concurrency: a change to an existing evaluation names the
   * version it was based on; anything else means someone saved meanwhile.
   */
  nextVersion(current: Evaluation | null, expectedVersion?: number): number {
    if (!current) {
      if (expectedVersion !== undefined && expectedVersion !== 0) {
        throw this.changed();
      }
      return 1;
    }
    if (expectedVersion !== current.version) throw this.changed();
    return current.version + 1;
  }

  /** Release is one-way and needs at least one graded team. */
  assertCanRelease(grading: MilestoneGrading | null, graded: number): void {
    if (grading?.releasedAt) {
      throw new EvaluationDomainError(
        "ALREADY_RELEASED",
        "These results are already released",
      );
    }
    if (graded === 0) {
      throw new EvaluationDomainError(
        "NOTHING_TO_RELEASE",
        "Grade at least one team before releasing",
      );
    }
  }

  /** Changed after its milestone's release: the team sees "Updated" (S2). */
  isUpdatedAfterRelease(
    evaluation: Pick<Evaluation, "updatedAt">,
    grading: Pick<MilestoneGrading, "releasedAt"> | null,
  ): boolean {
    return Boolean(
      grading?.releasedAt && evaluation.updatedAt > grading.releasedAt,
    );
  }

  private marksDisabled(): EvaluationDomainError {
    return new EvaluationDomainError(
      "MARKS_DISABLED",
      "This version of FlowForge gives feedback only, without marks",
    );
  }

  private changed(): EvaluationDomainError {
    return new EvaluationDomainError(
      "EVALUATION_CHANGED",
      "This evaluation was saved by someone else since you opened it; reload and try again",
    );
  }
}
