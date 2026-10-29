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
