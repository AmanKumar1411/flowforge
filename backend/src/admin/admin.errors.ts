import { DomainError } from "../common/errors/domain-error";

export type AdminErrorCode =
  "USER_NOT_FOUND" | "USER_NOT_A_STUDENT" | "CANNOT_DEACTIVATE_SELF";

export class AdminDomainError extends DomainError<AdminErrorCode> {}
