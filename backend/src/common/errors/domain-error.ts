export type CommonErrorCode = "ORIGIN_NOT_ALLOWED";

/** Base for expected business errors. The global filter maps `code` to an HTTP status. */
export class DomainError<Code extends string = string> extends Error {
  constructor(
    public readonly code: Code,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
