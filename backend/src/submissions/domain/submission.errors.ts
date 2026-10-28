import { DomainError } from "../../common/errors/domain-error";

export type SubmissionErrorCode =
  | "TEAM_NOT_FOUND"
  | "SUBMISSION_NOT_OPEN"
  | "SUBMISSION_CLOSED"
  | "IDEA_NOT_APPROVED"
  | "SUBMISSION_CHANGED";

export class SubmissionDomainError extends DomainError<SubmissionErrorCode> {}
