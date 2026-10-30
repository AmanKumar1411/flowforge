import { Transaction } from "../../../common/transaction";
import { NewSubmission, Submission } from "../../domain/submission";

export abstract class SubmissionRepository {
  /** The team's versions for one milestone, newest first. */
  abstract listByTeam(
    teamId: string,
    milestoneId: string,
  ): Promise<Submission[]>;
  /** Which milestones each of these teams has handed in at least one version for, in one query. */
  abstract listSubmittedMilestones(
    teamIds: readonly string[],
  ): Promise<{ teamId: string; milestoneId: string }[]>;
  /** Every version of every team for one milestone, newest first per team. */
  abstract listByMilestone(milestoneId: string): Promise<Submission[]>;
  /**
   * Locks the team row so one team's versions are numbered one after another,
   * then returns its latest version number for the milestone (0 before the first).
   */
  abstract lockLatestVersion(
    teamId: string,
    milestoneId: string,
    tx: Transaction,
  ): Promise<number>;
  /** Throws SUBMISSION_CHANGED if the version number was taken meanwhile. */
  abstract create(
    submission: NewSubmission,
    tx: Transaction,
  ): Promise<Submission>;
}
