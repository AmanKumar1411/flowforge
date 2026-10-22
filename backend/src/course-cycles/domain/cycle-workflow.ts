import { CycleDomainError } from "./cycle.errors";
import { CycleAction, CyclePatch, CycleStatus } from "./cycle.types";

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
  ],
  PUBLISHED: ["description", "submissionDeadline"],
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

  validatePublishRules(start: Date, deadline: Date): void {
    this.assertValidDeadline(start, deadline);
  }
}
