import { HttpStatus } from "@nestjs/common";
import type { AdminErrorCode } from "../../admin/admin.errors";
import type { AuthErrorCode } from "../../auth/domain/auth.errors";
import type { CycleErrorCode } from "../../course-cycles/domain/cycle.errors";
import type { TeamErrorCode } from "../../teams/domain/team.errors";
import type { CommonErrorCode } from "./domain-error";

type DomainErrorCode =
  | CommonErrorCode
  | AuthErrorCode
  | CycleErrorCode
  | AdminErrorCode
  | TeamErrorCode;

// `satisfies` makes the build fail when a new error code has no HTTP status.
const statusByCode = {
  UNAUTHENTICATED: HttpStatus.UNAUTHORIZED,
  INVALID_OAUTH_STATE: HttpStatus.UNAUTHORIZED,
  SIGN_IN_CANCELLED: HttpStatus.UNAUTHORIZED,
  INVALID_ID_TOKEN: HttpStatus.UNAUTHORIZED,
  INVALID_REFRESH_TOKEN: HttpStatus.UNAUTHORIZED,
  REFRESH_TOKEN_REUSED: HttpStatus.UNAUTHORIZED,
  TOKEN_REVOKED: HttpStatus.UNAUTHORIZED,
  ACCOUNT_DEACTIVATED: HttpStatus.UNAUTHORIZED,

  EMAIL_NOT_VERIFIED: HttpStatus.FORBIDDEN,
  WRONG_HOSTED_DOMAIN: HttpStatus.FORBIDDEN,
  EMAIL_NOT_ELIGIBLE: HttpStatus.FORBIDDEN,
  INVALID_BATCH_YEAR: HttpStatus.BAD_REQUEST,
  IDENTITY_CONFLICT: HttpStatus.CONFLICT,
  DEV_LOGIN_DISABLED: HttpStatus.NOT_FOUND,

  FORBIDDEN_ROLE: HttpStatus.FORBIDDEN,
  FACULTY_APPROVAL_PENDING: HttpStatus.FORBIDDEN,
  ORIGIN_NOT_ALLOWED: HttpStatus.FORBIDDEN,

  STUDENT_EMAIL_CANNOT_BE_ELEVATED: HttpStatus.BAD_REQUEST,
  INVALID_STAFF_EMAIL: HttpStatus.BAD_REQUEST,
  ALLOWLIST_ENTRY_EXISTS: HttpStatus.CONFLICT,
  ALLOWLIST_ENTRY_NOT_FOUND: HttpStatus.NOT_FOUND,
  FACULTY_REQUEST_NOT_FOUND: HttpStatus.NOT_FOUND,
  FACULTY_REQUEST_ALREADY_DECIDED: HttpStatus.CONFLICT,

  USER_NOT_FOUND: HttpStatus.NOT_FOUND,
  USER_NOT_A_STUDENT: HttpStatus.CONFLICT,
  CANNOT_DEACTIVATE_SELF: HttpStatus.CONFLICT,

  CYCLE_NOT_FOUND: HttpStatus.NOT_FOUND,
  NOT_CYCLE_OWNER: HttpStatus.FORBIDDEN,
  INVALID_STATUS_TRANSITION: HttpStatus.CONFLICT,
  CYCLE_ALREADY_CLOSED: HttpStatus.CONFLICT,
  CYCLE_FIELD_LOCKED: HttpStatus.CONFLICT,
  INVALID_DEADLINE: HttpStatus.BAD_REQUEST,
  INVALID_ACADEMIC_YEAR: HttpStatus.BAD_REQUEST,
  INVALID_TEAM_SIZE: HttpStatus.BAD_REQUEST,
  INVALID_TEAM_FORMATION_DEADLINE: HttpStatus.BAD_REQUEST,

  TEAM_NOT_FOUND: HttpStatus.NOT_FOUND,
  NOT_TEAM_LEADER: HttpStatus.FORBIDDEN,
  TEAM_FORMATION_CLOSED: HttpStatus.CONFLICT,
  TEAM_SIZE_OUT_OF_RANGE: HttpStatus.BAD_REQUEST,
  INELIGIBLE_TEAM_MEMBER: HttpStatus.BAD_REQUEST,
  STUDENT_ALREADY_IN_TEAM: HttpStatus.CONFLICT,
} satisfies Record<DomainErrorCode, HttpStatus>;

export const statusForCode = (code: string): HttpStatus =>
  statusByCode[code as DomainErrorCode] ?? HttpStatus.BAD_REQUEST;
