export type CycleErrorCode =
  | "CYCLE_NOT_FOUND"
  | "NOT_CYCLE_OWNER"
  | "UNAUTHORIZED_BATCH_ACCESS"
  | "INVALID_STATUS_TRANSITION"
  | "CYCLE_ALREADY_CLOSED"
  | "CYCLE_FIELD_LOCKED"
  | "INVALID_DEADLINE";

export class CycleDomainError extends Error {
  constructor(
    public readonly code: CycleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CycleDomainError";
  }
}
