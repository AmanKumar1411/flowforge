export type CommonErrorCode = "ORIGIN_NOT_ALLOWED";

/** One of several problems an error reports together (for example every failed publish check). */
export interface ErrorDetail {
  code: string;
  message: string;
}

/** Base for expected business errors. The global filter maps `code` to an HTTP status. */
export class DomainError<Code extends string = string> extends Error {
  constructor(
    public readonly code: Code,
    message: string,
    public readonly details?: readonly ErrorDetail[],
  ) {
    super(message);
    this.name = new.target.name;
  }
}
