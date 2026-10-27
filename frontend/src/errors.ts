import { ApiError } from "./api/client";

const messages: Record<string, string> = {
  // Sign-in denials (shown on /login?error=CODE)
  INVALID_OAUTH_STATE:
    "Your sign-in expired or was started in another browser. Please try again.",
  SIGN_IN_CANCELLED: "Google sign-in was cancelled.",
  INVALID_ID_TOKEN: "Google's response could not be verified. Please try again.",
  EMAIL_NOT_VERIFIED: "Your Google account's email address is not verified.",
  WRONG_HOSTED_DOMAIN: "Sign in with your @nst.rishihood.edu.in Google account.",
  EMAIL_NOT_ELIGIBLE:
    "This email address cannot be used with FlowForge. Contact the coordinator.",
  ACCOUNT_DEACTIVATED: "Your account is deactivated. Contact the coordinator.",
  INVALID_BATCH_YEAR:
    "We could not read a valid batch year from your email. Contact the coordinator.",
  IDENTITY_CONFLICT:
    "This email is linked to a different Google account. Contact the coordinator.",
  DEV_LOGIN_DISABLED: "Dev login is turned off on this server.",
  TOO_MANY_REQUESTS: "Too many attempts. Wait a minute and try again.",
  // Session endings
  REFRESH_TOKEN_REUSED:
    "For your safety we ended this session everywhere. Please sign in again.",
  TOKEN_REVOKED: "Your session ended. Please sign in again.",
  INVALID_REFRESH_TOKEN: "Your session ended. Please sign in again.",
  NETWORK_ERROR: "The FlowForge API is not reachable.",
  // Authorization
  FORBIDDEN_ROLE: "Your role cannot do that.",
  FACULTY_APPROVAL_PENDING: "Your faculty access is waiting for admin approval.",
  // Faculty access administration
  STUDENT_EMAIL_CANNOT_BE_ELEVATED:
    "Student email addresses can never be given faculty or admin access.",
  INVALID_STAFF_EMAIL: "Only university staff email addresses can be added.",
  ALLOWLIST_ENTRY_EXISTS: "That email is already on the faculty allowlist.",
  FACULTY_REQUEST_ALREADY_DECIDED: "That request has already been decided.",
  CANNOT_DEACTIVATE_SELF: "You cannot deactivate your own account.",
  USER_NOT_A_STUDENT: "Only students have a batch year.",
  // Course cycles
  CYCLE_FIELD_LOCKED: "That field is locked once a cycle is published.",
  CYCLE_ALREADY_CLOSED: "Closed cycles are immutable.",
  INVALID_DEADLINE: "The submission start must be before the deadline.",
  INVALID_ACADEMIC_YEAR: "Use consecutive years in the form 2026-27.",
  CYCLE_NOT_FOUND: "That cycle is not available.",
};

export function messageForCode(code: string | null | undefined): string | null {
  return code ? (messages[code] ?? "Something went wrong. Please try again.") : null;
}

export function readableError(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Something went wrong. Check the API and try again.";
  }
  return (error.code && messages[error.code]) || error.message;
}
