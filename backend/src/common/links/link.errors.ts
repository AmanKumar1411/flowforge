import { DomainError } from "../errors/domain-error";

export type LinkErrorCode =
  | "MISSING_REQUIRED_LINK"
  | "LINK_NOT_ALLOWED"
  | "INVALID_LINK"
  | "INVALID_LINK_REQUIREMENT";

export class LinkDomainError extends DomainError<LinkErrorCode> {}
