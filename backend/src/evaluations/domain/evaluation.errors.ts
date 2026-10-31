import { DomainError } from "../../common/errors/domain-error";

export type EvaluationErrorCode =
  | "MILESTONE_NOT_FOUND"
  | "TEAM_NOT_FOUND"
  | "GRADING_NOT_OPEN"
  | "GRADING_CLOSED"
  | "INVALID_MAX_MARKS"
  | "MAX_MARKS_BELOW_EXISTING"
  | "MAX_MARKS_NOT_SET"
  | "INVALID_MARKS"
  | "MARKS_DISABLED"
  | "EMPTY_EVALUATION"
  | "EVALUATION_CHANGED"
  | "ALREADY_RELEASED"
  | "NOTHING_TO_RELEASE";

export class EvaluationDomainError extends DomainError<EvaluationErrorCode> {}
