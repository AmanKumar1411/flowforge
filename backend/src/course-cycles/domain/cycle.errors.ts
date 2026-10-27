import { DomainError } from "../../common/errors/domain-error";

export type CycleErrorCode =
  | "CYCLE_NOT_FOUND"
  | "NOT_CYCLE_OWNER"
  | "INVALID_STATUS_TRANSITION"
  | "CYCLE_ALREADY_CLOSED"
  | "CYCLE_FIELD_LOCKED"
  | "INVALID_DEADLINE"
  | "INVALID_ACADEMIC_YEAR"
  | "INVALID_TEAM_SIZE"
  | "INVALID_TEAM_FORMATION_DEADLINE"
  | "INVALID_TEAM_COMPLETION_DEADLINE"
  | "CYCLE_NOT_ELECTIVE"
  | "ENROLLMENT_NOT_FOUND";

export class CycleDomainError extends DomainError<CycleErrorCode> {}
