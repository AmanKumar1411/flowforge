import { Link } from "../../common/links/link-type";
import { NewSubmission, Person, Submission } from "../domain/submission";

const SUBMITTED = new Date("2030-01-10T09:00:00.000Z");

/** A valid version of a team's work: `aSubmission().forTeam("t").version(2).build()`. */
export class SubmissionBuilder {
  private id = "submission-1";
  private teamId = "team-1";
  private cycleId = "cycle-1";
  private milestoneId = "milestone-1";
  private versionNumber = 1;
  private links: Link[] = [
    { type: "GITHUB", url: "https://github.com/flowforge/falcon" },
  ];
  private notes: string | null = null;
  private submitter: Person = { id: "member-1", name: "Member One" };
  private submittedAt = SUBMITTED;

  forTeam(teamId: string): this {
    this.teamId = teamId;
    return this;
  }

  inCycle(cycleId: string): this {
    this.cycleId = cycleId;
    return this;
  }

  forMilestone(milestoneId: string): this {
    this.milestoneId = milestoneId;
    return this;
  }

  version(version: number): this {
    this.versionNumber = version;
    return this;
  }

  withNotes(notes: string): this {
    this.notes = notes;
    return this;
  }

  by(person: Person): this {
    this.submitter = person;
    return this;
  }

  at(submittedAt: Date): this {
    this.submittedAt = submittedAt;
    return this;
  }

  /** What `SubmissionRepository.create` takes. */
  buildNew(): NewSubmission {
    return {
      teamId: this.teamId,
      cycleId: this.cycleId,
      milestoneId: this.milestoneId,
      version: this.versionNumber,
      links: this.links,
      notes: this.notes,
      submittedBy: this.submitter,
      submittedAt: this.submittedAt,
    };
  }

  build(): Submission {
    return { ...this.buildNew(), id: this.id };
  }
}

export const aSubmission = (): SubmissionBuilder => new SubmissionBuilder();
