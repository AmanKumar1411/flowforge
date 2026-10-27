import { Clock } from "../../common/clock";
import { AuthDomainError } from "./auth.errors";

/** A batch year is plausible from the configured minimum up to next year. */
export class BatchYearPolicy {
  constructor(
    private readonly minYear: number,
    private readonly clock: Clock,
  ) {}

  assertValid(batchYear: number): void {
    const maxYear = this.clock.now().getUTCFullYear() + 1;
    if (
      !Number.isInteger(batchYear) ||
      batchYear < this.minYear ||
      batchYear > maxYear
    ) {
      throw new AuthDomainError(
        "INVALID_BATCH_YEAR",
        `Batch year must be between ${this.minYear} and ${maxYear}`,
      );
    }
  }
}
