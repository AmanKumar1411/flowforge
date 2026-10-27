import { DomainError } from "../../common/errors/domain-error";

export type AuthErrorCode =
  // Authentication: who is calling
  | "UNAUTHENTICATED"
  | "INVALID_OAUTH_STATE"
  | "SIGN_IN_CANCELLED"
  | "INVALID_ID_TOKEN"
  | "INVALID_REFRESH_TOKEN"
  | "REFRESH_TOKEN_REUSED"
  | "TOKEN_REVOKED"
  | "ACCOUNT_DEACTIVATED"
  // Login eligibility
  | "EMAIL_NOT_VERIFIED"
  | "WRONG_HOSTED_DOMAIN"
  | "EMAIL_NOT_ELIGIBLE"
  | "INVALID_BATCH_YEAR"
  | "IDENTITY_CONFLICT"
  | "DEV_LOGIN_DISABLED"
  // Authorization
  | "FORBIDDEN_ROLE"
  | "FACULTY_APPROVAL_PENDING"
  // Faculty access
  | "STUDENT_EMAIL_CANNOT_BE_ELEVATED"
  | "INVALID_STAFF_EMAIL"
  | "ALLOWLIST_ENTRY_EXISTS"
  | "ALLOWLIST_ENTRY_NOT_FOUND"
  | "FACULTY_REQUEST_NOT_FOUND"
  | "FACULTY_REQUEST_ALREADY_DECIDED";

export class AuthDomainError extends DomainError<AuthErrorCode> {}
