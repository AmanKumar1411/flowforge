import { FixedClock } from "../../common/testing/fixed-clock";
import { AuthDomainError } from "./auth.errors";
import { BatchYearPolicy } from "./batch-year.policy";

describe("BatchYearPolicy", () => {
  const clock = new FixedClock("2026-10-23T09:00:00.000Z");
  const policy = new BatchYearPolicy(2018, clock);

  it.each([2018, 2023, 2026, 2027])("accepts %i", (batchYear) => {
    expect(() => policy.assertValid(batchYear)).not.toThrow();
  });

  it.each([2017, 2028, 2099, 2023.5, Number.NaN])("rejects %d", (batchYear) => {
    expect(() => policy.assertValid(batchYear)).toThrow(
      expect.objectContaining({
        code: "INVALID_BATCH_YEAR",
      }) as AuthDomainError,
    );
  });

  it("moves the upper bound with the injected clock", () => {
    const laterClock = new FixedClock("2027-01-01T00:00:00.000Z");
    const later = new BatchYearPolicy(2018, laterClock);

    expect(() => later.assertValid(2028)).not.toThrow();
    expect(() => policy.assertValid(2028)).toThrow(AuthDomainError);
  });
});
