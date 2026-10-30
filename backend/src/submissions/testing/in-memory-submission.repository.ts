import { SubmissionRepository } from "../application/ports/submission.repository";
import { NewSubmission, Person, Submission } from "../domain/submission";
import { SubmissionDomainError } from "../domain/submission.errors";

/** Submissions in a list, with people looked up by id. */
export class InMemorySubmissionRepository extends SubmissionRepository {
  private readonly rows: Submission[] = [];

  constructor(private readonly people: (id: string) => Person) {
    super();
  }

  listByTeam(teamId: string, milestoneId: string): Promise<Submission[]> {
    return Promise.resolve(
      this.newestFirst(
        (row) => row.teamId === teamId && row.milestoneId === milestoneId,
      ),
    );
  }

  listSubmittedMilestones(
    teamIds: readonly string[],
  ): Promise<{ teamId: string; milestoneId: string }[]> {
    const pairs = new Map(
      this.rows
        .filter((row) => teamIds.includes(row.teamId))
        .map((row) => [
          `${row.teamId}:${row.milestoneId}`,
          { teamId: row.teamId, milestoneId: row.milestoneId },
        ]),
    );
    return Promise.resolve([...pairs.values()]);
  }

  listByMilestone(milestoneId: string): Promise<Submission[]> {
    return Promise.resolve(
      this.newestFirst((row) => row.milestoneId === milestoneId),
    );
  }

  lockLatestVersion(teamId: string, milestoneId: string): Promise<number> {
    return Promise.resolve(
      Math.max(
        0,
        ...this.rows
          .filter(
            (row) => row.teamId === teamId && row.milestoneId === milestoneId,
          )
          .map((row) => row.version),
      ),
    );
  }

  create(submission: NewSubmission): Promise<Submission> {
    if (
      this.rows.some(
        (row) =>
          row.teamId === submission.teamId &&
          row.milestoneId === submission.milestoneId &&
          row.version === submission.version,
      )
    ) {
      throw new SubmissionDomainError("SUBMISSION_CHANGED", "Version taken");
    }
    const { submittedById, ...rest } = submission;
    const created = {
      ...rest,
      id: `submission-${this.rows.length + 1}`,
      submittedBy: this.people(submittedById),
    };
    this.rows.push(created);
    return Promise.resolve(structuredClone(created));
  }

  private newestFirst(keep: (row: Submission) => boolean): Submission[] {
    return this.rows
      .filter(keep)
      .sort((a, b) => b.version - a.version)
      .map((row) => structuredClone(row));
  }
}
