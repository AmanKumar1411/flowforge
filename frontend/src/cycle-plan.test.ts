import { describe, expect, it } from "vitest";
import { addDays, defaultPlan, endOfDay, isValidDay, minuteAfter, shiftInput, termWarnings } from "./cycle-plan";
import { semesterTerm } from "./semester";

// Phase 8: the plan is a team deadline, an idea deadline and milestones (it was built from phase lengths).
describe("cycle-plan", () => {
  it("moves days and inputs, at the end of a day", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(endOfDay("2026-11-04")).toBe("2026-11-04T23:59");
    expect(shiftInput("2026-11-04T23:59", 7)).toBe("2026-11-11T23:59");
    expect(minuteAfter("2026-11-04T23:59")).toBe("2026-11-05T00:00");
    expect(isValidDay("2026-02-30")).toBe(false);
    expect(isValidDay("2026-02-28")).toBe(true);
  });

  it("starts a plan today, or when the term starts if that is later", () => {
    const term = semesterTerm(2023, 7); // Aug–Dec 2026
    expect(defaultPlan(term, new Date(2026, 9, 29))).toEqual({
      teamDeadline: "2026-11-05T23:59",
      ideaDeadline: "2026-11-12T23:59",
      milestone: { opensAt: "2026-11-13T00:00", dueAt: "2026-11-26T23:59", evaluationAt: "2026-11-28T23:59" },
    });
    expect(defaultPlan(term, new Date(2026, 5, 1)).teamDeadline).toBe("2026-08-08T23:59");
  });

  it("warns, without blocking, when the plan leaves its term", () => {
    const term = semesterTerm(2023, 7);
    expect(termWarnings(term, { teamDeadline: "2026-11-05T23:59", lastDate: "2026-12-20T23:59" })).toEqual([]);
    const warnings = termWarnings(term, { teamDeadline: "2026-07-20T23:59", lastDate: "2027-01-10T23:59" });
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatch(/team deadline.*outside semester 7 \(Aug–Dec 2026\)/);
    expect(warnings[1]).toMatch(/last milestone ends .*after semester 7/);
  });
});
