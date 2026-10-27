import { DomainError } from "../../common/errors/domain-error";

export type TeamErrorCode =
  | "TEAM_NOT_FOUND"
  | "NOT_TEAM_LEADER"
  | "TEAM_FORMATION_CLOSED"
  | "TEAM_SIZE_OUT_OF_RANGE"
  | "INELIGIBLE_TEAM_MEMBER"
  | "STUDENT_ALREADY_IN_TEAM";

export class TeamDomainError extends DomainError<TeamErrorCode> {}
