import { CycleDomainError } from "./cycle.errors";
import {
  CycleAction,
  CyclePatch,
  CycleSchedule,
  CycleStatus,
  TEAM_SIZE_LIMIT,
} from "./cycle.types";

const transitions: Record<
  CycleStatus,
  Partial<Record<CycleAction, CycleStatus>>
> = {
  DRAFT: { PUBLISH: "PUBLISHED" },
  PUBLISHED: { CLOSE: "CLOSED" },
  CLOSED: {},
};

const editableFields: Record<CycleStatus, readonly (keyof CyclePatch)[]> = {
  DRAFT: [
    "courseName",
    "title",
    "description",
    "batchYear",
    "semester",
    "academicYear",
    "submissionStartAt",
    "submissionDeadline",
    "minTeamSize",
    "maxTeamSize",
    "teamFormationDeadline",
  ],
  // Team sizes are fixed once students can form teams; the deadline can still move (see assertTeamDeadlineChange).
  PUBLISHED: ["description", "submissionDeadline", "teamFormationDeadline"],
  CLOSED: [],
};

export class CycleWorkflow {
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

  editableFields(status: CycleStatus): readonly (keyof CyclePatch)[] {
    return editableFields[status];
  }

  assertEditable(
    status: CycleStatus,
    fields: readonly (keyof CyclePatch)[],
  ): void {
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

  assertValidDeadline(start: Date, deadline: Date): void {
    if (!(start < deadline)) {
      throw new CycleDomainError(
        "INVALID_DEADLINE",
        "Submission start must be before the deadline",
      );
    }
  }

  /** Every date and team-size rule that holds for any saved cycle. */
  assertValidSchedule(schedule: CycleSchedule): void {
    this.assertValidDeadline(
      schedule.submissionStartAt,
      schedule.submissionDeadline,
    );
    const { minTeamSize: min, maxTeamSize: max } = schedule;
    if (
      !Number.isInteger(min) ||
      !Number.isInteger(max) ||
      min < 1 ||
      min > max ||
      max > TEAM_SIZE_LIMIT
    ) {
      throw new CycleDomainError(
        "INVALID_TEAM_SIZE",
        `Team size must satisfy 1 <= minimum <= maximum <= ${TEAM_SIZE_LIMIT}`,
      );
    }
    if (!(schedule.teamFormationDeadline < schedule.submissionDeadline)) {
      throw new CycleDomainError(
        "INVALID_TEAM_FORMATION_DEADLINE",
        "Team formation must end before the submission deadline",
      );
    }
  }

  /**
   * On a published cycle the formation deadline may move only while formation
   * is still open, and never into the past: teams that are fixed stay fixed.
   */
  assertTeamDeadlineChange(current: Date, next: Date, now: Date): void {
    if (current <= now) {
      throw new CycleDomainError(
        "CYCLE_FIELD_LOCKED",
        "Team formation has ended, so its deadline can no longer change",
      );
    }
    if (next <= now) {
      throw new CycleDomainError(
        "INVALID_TEAM_FORMATION_DEADLINE",
        "The new team formation deadline must be in the future",
      );
    }
  }

  validatePublishRules(schedule: CycleSchedule): void {
    this.assertValidSchedule(schedule);
  }
}
