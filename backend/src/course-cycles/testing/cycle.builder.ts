import { LinkRequirement } from "../../common/links/link-requirement";
import {
  CourseKind,
  Cycle,
  CycleCreateData,
  CycleIdeaSource,
  CycleStatus,
  DEFAULT_TEAM_SIZE,
} from "../domain/cycle.types";
import { Milestone, PlacedMilestone } from "../domain/milestone";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/**
 * A valid cycle for a test, which says only what matters to it:
 * `aCycle().published().withMilestones(3).build()`. The dates start from a fixed
 * moment and follow the schedule rule (`teamDeadline < ideaDeadline <= M1.opens
 * < M1.due <= M1.evaluation <= M2.opens …`), so a built cycle passes the
 * workflow's publish problems. Pass `.startingAt()` to place it around a test's clock.
 */
export class CycleBuilder {
  private id = "cycle-1";
  private status: CycleStatus = "DRAFT";
  private kind: CourseKind = "CORE";
  private ideaSource: CycleIdeaSource = "BOTH";
  private facultyId = "faculty-1";
  private batchYear = 2026;
  private milestoneCount = 0;
  private start = new Date("2030-01-07T09:00:00.000Z");

  withId(id: string): this {
    this.id = id;
    return this;
  }

  inStatus(status: CycleStatus): this {
    this.status = status;
    return this;
  }

  published(): this {
    return this.inStatus("PUBLISHED");
  }

  closed(): this {
    return this.inStatus("CLOSED");
  }

  ofKind(kind: CourseKind): this {
    this.kind = kind;
    return this;
  }

  elective(): this {
    return this.ofKind("ELECTIVE");
  }

  withIdeaSource(ideaSource: CycleIdeaSource): this {
    this.ideaSource = ideaSource;
    return this;
  }

  ownedBy(facultyId: string): this {
    this.facultyId = facultyId;
    return this;
  }

  forBatch(batchYear: number): this {
    this.batchYear = batchYear;
    return this;
  }

  withMilestones(count: number): this {
    this.milestoneCount = count;
    return this;
  }

  /** The team deadline falls a day after this moment, and the idea deadline a day later. */
  startingAt(start: Date): this {
    this.start = start;
    return this;
  }

  /** What `CycleRepository.create` takes. */
  buildCreateData(): CycleCreateData {
    return {
      courseName: "Software Design",
      title: "Course project",
      description: null,
      batchYear: this.batchYear,
      semester: 7,
      academicYear: "2029-30",
      minTeamSize: DEFAULT_TEAM_SIZE.min,
      maxTeamSize: DEFAULT_TEAM_SIZE.max,
      teamDeadline: this.after(DAY_MS),
      ideaDeadline: this.after(2 * DAY_MS),
      ideaSource: this.ideaSource,
      ideaLinkRequirement: LinkRequirement.IDEA_DEFAULT,
      kind: this.kind,
      createdByFacultyId: this.facultyId,
    };
  }

  /** One week each, one after another, starting at the idea deadline. */
  buildMilestones(): PlacedMilestone[] {
    return Array.from({ length: this.milestoneCount }, (_, index) => {
      const opens = this.after(2 * DAY_MS + index * WEEK_MS);
      const due = new Date(opens.getTime() + WEEK_MS);
      return {
        position: index + 1,
        name: `Milestone ${index + 1}`,
        description: null,
        submissionOpensAt: opens,
        submissionDueAt: due,
        evaluationAt: due,
        linkRequirement: LinkRequirement.MILESTONE_DEFAULT,
      };
    });
  }

  build(): Cycle {
    const milestones = this.buildMilestones().map((placed): Milestone => ({
      ...placed,
      id: `${this.id}-m${placed.position}`,
      cycleId: this.id,
      createdAt: this.start,
      updatedAt: this.start,
    }));
    return {
      ...this.buildCreateData(),
      id: this.id,
      milestones,
      status: this.status,
      publishedAt: this.status === "DRAFT" ? null : this.start,
      closedAt: this.status === "CLOSED" ? this.start : null,
      createdAt: this.start,
      updatedAt: this.start,
    };
  }

  private after(milliseconds: number): Date {
    return new Date(this.start.getTime() + milliseconds);
  }
}

export const aCycle = (): CycleBuilder => new CycleBuilder();
