import { Transaction } from "../../../common/transaction";
import { Evaluation, MilestoneGrading } from "../../domain/evaluation";

/** A save of one team's evaluation, already checked by the rules. */
export interface EvaluationSave {
  milestoneId: string;
  teamId: string;
  cycleId: string;
  marks: number | null;
  feedback: string | null;
  version: number;
  evaluatedById: string;
  /** When it is saved, from the injected clock (compared with the release time). */
  at: Date;
}

/** A released evaluation, with what a team needs to read it. */
export interface ReleasedEvaluation extends Evaluation {
  maxMarks: number | null;
  releasedAt: Date;
}

export abstract class EvaluationRepository {
  abstract findGrading(
    milestoneId: string,
    tx?: Transaction,
  ): Promise<MilestoneGrading | null>;
  /**
   * Creates the milestone's grading row if needed and locks it (FOR UPDATE)
   * for the rest of the transaction: scale changes and releases take turns.
   */
  abstract lockGrading(
    milestoneId: string,
    tx: Transaction,
  ): Promise<MilestoneGrading>;
  /** Locks the grading row for reading (FOR SHARE): the scale cannot change during a save. */
  abstract shareGrading(
    milestoneId: string,
    tx: Transaction,
  ): Promise<MilestoneGrading>;
  abstract setMaxMarks(
    milestoneId: string,
    maxMarks: number,
    tx: Transaction,
  ): Promise<MilestoneGrading>;
  /** Null when the milestone was already released (one-way). */
  abstract release(
    milestoneId: string,
    releasedById: string,
    at: Date,
    tx: Transaction,
  ): Promise<MilestoneGrading | null>;
  abstract listByMilestone(
    milestoneId: string,
    tx?: Transaction,
  ): Promise<Evaluation[]>;
  abstract findByTeam(
    milestoneId: string,
    teamId: string,
    tx?: Transaction,
  ): Promise<Evaluation | null>;
  abstract highestMark(
    milestoneId: string,
    tx: Transaction,
  ): Promise<number | null>;
  /**
   * Writes the evaluation and its revision. Version 1 creates it; a later
   * version replaces it only while it is still at `version - 1`. A lost race
   * (either way) is EVALUATION_CHANGED.
   */
  abstract save(save: EvaluationSave, tx: Transaction): Promise<Evaluation>;
  /**
   * The released evaluations of these teams, for a student who is a member
   * of each. Both conditions are in the SQL: released milestones only, and
   * teams the user belongs to.
   */
  abstract listReleasedForMember(
    userId: string,
    teamIds: readonly string[],
  ): Promise<ReleasedEvaluation[]>;
}
