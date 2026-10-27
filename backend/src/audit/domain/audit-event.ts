export type AuditAction =
  | "LOGIN_SUCCEEDED"
  | "LOGIN_DENIED"
  | "USER_CREATED"
  | "ROLE_ASSIGNED"
  | "FACULTY_REQUEST_CREATED"
  | "FACULTY_REQUEST_APPROVED"
  | "FACULTY_REQUEST_REJECTED"
  | "FACULTY_ALLOWLIST_ADDED"
  | "FACULTY_ALLOWLIST_REMOVED"
  | "ELEVATION_DENIED"
  | "USER_BATCH_CORRECTED"
  | "USER_DEACTIVATED"
  | "USER_REACTIVATED"
  | "LOGOUT"
  | "LOGOUT_ALL"
  | "REFRESH_TOKEN_REUSE_DETECTED";

export type AuditEntityType =
  | "User"
  | "LoginAttempt"
  | "FacultyAccessRequest"
  | "FacultyAllowlistEntry"
  | "RefreshTokenFamily";

export type AuditMetadata = Record<string, string | number | boolean | null>;

export interface AuditEvent {
  action: AuditAction;
  /** The user who caused the event; null when nobody is signed in yet. */
  actorId: string | null;
  entityType: AuditEntityType;
  entityId: string;
  metadata?: AuditMetadata;
}
