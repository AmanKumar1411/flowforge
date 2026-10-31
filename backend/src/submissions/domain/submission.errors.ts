import { DomainError } from "../../common/errors/domain-error";

export type SubmissionErrorCode =
  | "TEAM_NOT_FOUND"
  | "SUBMISSION_NOT_OPEN"
  | "SUBMISSION_CLOSED"
  | "IDEA_NOT_APPROVED"
  | "SUBMISSION_CHANGED"
  | "VERSION_LIMIT_REACHED"
  | "MILESTONE_NOT_FOUND";

export class SubmissionDomainError extends DomainError<SubmissionErrorCode> {}
