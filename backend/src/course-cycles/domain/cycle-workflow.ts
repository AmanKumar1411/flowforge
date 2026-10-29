import { CycleDomainError, CycleErrorCode } from "./cycle.errors";
import {
  CycleAction,
  CycleSchedule,
  CycleStatus,
  EditableField,
  StageDeadline,
  TEAM_SIZE_LIMIT,
} from "./cycle.types";
import { Milestone, MilestoneInput } from "./milestone";
import { MilestoneSchedule, ScheduleProblem } from "./milestone-schedule";

const deadlineRules: Record<
  StageDeadline,
  { label: string; invalid: CycleErrorCode }
> = {
  teamDeadline: { label: "Team formation", invalid: "INVALID_TEAM_DEADLINE" },
  ideaDeadline: { label: "Idea submission", invalid: "INVALID_IDEA_DEADLINE" },
};

const transitions: Record<
  CycleStatus,
  Partial<Record<CycleAction, CycleStatus>>
> = {
  DRAFT: { PUBLISH: "PUBLISHED" },
  PUBLISHED: { CLOSE: "CLOSED" },
  CLOSED: {},
};

const editableFields: Record<CycleStatus, readonly EditableField[]> = {
  DRAFT: [
    "courseName",
    "title",
    "description",
    "batchYear",
    "semester",
    "academicYear",
    "minTeamSize",
    "maxTeamSize",
    "teamDeadline",
    "ideaDeadline",
    "ideaSource",
    "ideaLinkRequirement",
    "kind",
    "milestones",
  ],
  // Sizes, the kind and the idea rules are fixed once students can act. The
  // deadlines move while their stage is open (assertStageDeadlineChange);
  // milestones follow A3 (assertPublishedMilestones).
  PUBLISHED: ["description", "teamDeadline", "ideaDeadline", "milestones"],
  CLOSED: [],
};

/** The cycle's state machine and the rules every save keeps. Pure. */
export class CycleWorkflow {
  private readonly schedule = new MilestoneSchedule();

  transition(status: CycleStatus, action: CycleAction): CycleStatus {
    const nextStatus = transitions[status][action];
    if (!nextStatus) {
      if (status === "CLOSED") {
        throw new CycleDomainError(
          "CYCLE_ALREADY_CLOSED",
          "Closed cycles cannot change state",
        );
      }
      throw new CycleDomainError(
        "INVALID_STATUS_TRANSITION",
        `Cannot ${action.toLowerCase()} a ${status.toLowerCase()} cycle`,
      );
    }
    return nextStatus;
  }

  editableFields(status: CycleStatus): readonly EditableField[] {
    return editableFields[status];
  }

  assertEditable(status: CycleStatus, fields: readonly EditableField[]): void {
    if (status === "CLOSED") {
      throw new CycleDomainError(
        "CYCLE_ALREADY_CLOSED",
        "Closed cycles cannot be edited",
      );
    }
    const allowed = new Set(this.editableFields(status));
    if (fields.some((field) => !allowed.has(field))) {
      throw new CycleDomainError(
        "CYCLE_FIELD_LOCKED",
        `One or more fields are locked for ${status.toLowerCase()} cycles`,
      );
    }
  }

  /** Every date and team-size rule that holds for any saved cycle. */
  assertValidSchedule(schedule: CycleSchedule): void {
    const [problem] = this.teamSizeProblems(schedule);
    if (problem) throw new CycleDomainError(problem.code, problem.message);
    this.schedule.assertValid(schedule);
  }

  /** Everything a cycle must satisfy to be published, all at once: the save rules plus a first milestone. */
  publishProblems(schedule: CycleSchedule): ScheduleProblem[] {
    return [
      ...this.teamSizeProblems(schedule),
      ...this.schedule.problems(schedule, { forPublish: true }),
    ];
  }

  /**
   * On a published cycle a stage deadline may move only while its stage is
   * still open, and never into the past: a stage that has ended stays ended.
   */
  assertStageDeadlineChange(
    deadline: StageDeadline,
    current: Date,
    next: Date,
    now: Date,
  ): void {
    const { label, invalid } = deadlineRules[deadline];
    if (current <= now) {
      throw new CycleDomainError(
        "CYCLE_FIELD_LOCKED",
        `${label} has ended, so its deadline can no longer change`,
      );
    }
    if (next <= now) {
      throw new CycleDomainError(
        invalid,
        `The new ${label.toLowerCase()} deadline must be in the future`,
      );
    }
  }

  /** A3: after publishing, only a milestone that has not opened changes, only its dates and description. */
  assertPublishedMilestones(
    current: readonly Milestone[],
    next: readonly MilestoneInput[],
    now: Date,
  ): void {
    this.schedule.assertPublishedChange(current, next, now);
  }

  private teamSizeProblems(schedule: CycleSchedule): ScheduleProblem[] {
    const { minTeamSize: min, maxTeamSize: max } = schedule;
    const valid =
      Number.isInteger(min) &&
      Number.isInteger(max) &&
      min >= 1 &&
      min <= max &&
      max <= TEAM_SIZE_LIMIT;
    return valid
      ? []
      : [
          {
            code: "INVALID_TEAM_SIZE",
            message: `Team size must satisfy 1 <= minimum <= maximum <= ${TEAM_SIZE_LIMIT}`,
          },
        ];
  }
}
