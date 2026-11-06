const MINUTE_MS = 60_000;

/**
 * The next whole minute, for a FixedClock whose test needs a fresh rate-limit
 * window. It comes from the real date, because sessions last a day and the test
 * browser drops a cookie that has expired by real time.
 */
export const nextMinute = (): Date =>
  new Date(Math.ceil(Date.now() / MINUTE_MS) * MINUTE_MS);

/** A milestone for a cycle request body: open from `opens` until `due`, evaluated when due. */
export const milestone = (
  name: string,
  opens: string,
  due: string,
  extra: Record<string, unknown> = {},
) => ({
  name,
  submissionOpensAt: opens,
  submissionDueAt: due,
  evaluationAt: due,
  ...extra,
});
