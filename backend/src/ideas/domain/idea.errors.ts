import { DomainError } from "../../common/errors/domain-error";

export type IdeaErrorCode =
  | "TEAM_NOT_FOUND"
  | "NOT_TEAM_LEADER"
  | "IDEA_NOT_FOUND"
  | "IDEA_SUBMISSION_CLOSED"
  | "IDEA_RESUBMISSION_CLOSED"
  | "IDEA_ALREADY_APPROVED"
  | "IDEA_NOT_AWAITING_REVIEW"
  | "IDEA_CHANGED"
  | "IDEA_REVIEW_CLOSED"
  | "IDEA_FEEDBACK_REQUIRED"
  | "CATALOG_IDEA_NOT_FOUND"
  | "CATALOG_IDEA_PICKED"
  | "CATALOG_CLOSED"
  | "PROPOSALS_NOT_ALLOWED"
  | "CATALOG_NOT_ALLOWED";

export class IdeaDomainError extends DomainError<IdeaErrorCode> {}
