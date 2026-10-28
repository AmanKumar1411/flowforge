import { Transaction } from "../../../common/transaction";
import { NewSubmission, Submission } from "../../domain/submission";

export abstract class SubmissionRepository {
  /** Newest version first. */
  abstract listByTeam(teamId: string): Promise<Submission[]>;
  /** Every version of every team of the cycle, newest first. */
  abstract listByCycle(cycleId: string): Promise<Submission[]>;
  /**
   * Locks the team row so one team's versions are numbered one after another,
   * then returns its latest version number (0 before the first).
   */
  abstract lockLatestVersion(teamId: string, tx: Transaction): Promise<number>;
  /** Throws SUBMISSION_CHANGED if the version number was taken meanwhile. */
  abstract create(
    submission: NewSubmission,
    tx: Transaction,
  ): Promise<Submission>;
}
