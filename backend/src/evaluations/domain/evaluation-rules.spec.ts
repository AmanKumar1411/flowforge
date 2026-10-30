import { EvaluationDomainError } from "./evaluation.errors";
import { Evaluation, GradingCycle, MilestoneGrading } from "./evaluation";
import { EvaluationRules } from "./evaluation-rules";

const rules = new EvaluationRules();
const at = (day: number) => new Date(Date.UTC(2026, 10, day, 12));
const m1 = {
  id: "m1",
  position: 1,
  name: "Design review",
  submissionDueAt: at(15),
};
const cycle = {
  id: "cycle",
  status: "PUBLISHED",
  createdByFacultyId: "faculty",
  milestones: [m1],
} as unknown as GradingCycle;
const grading = (
  overrides: Partial<MilestoneGrading> = {},
): MilestoneGrading => ({
  milestoneId: "m1",
  maxMarks: 20,
  releasedAt: null,
  releasedById: null,
  ...overrides,
});
const evaluation = (version: number): Evaluation => ({
  id: "e1",
  milestoneId: "m1",
  teamId: "t1",
  cycleId: "cycle",
  marks: 14,
  feedback: null,
  version,
  evaluatedById: "faculty",
  createdAt: at(16),
  updatedAt: at(16),
});
const codeOf = (work: () => unknown) => {
  try {
    work();
  } catch (error) {
    if (error instanceof EvaluationDomainError) return error.code;
    throw error;
  }
  return undefined;
};

describe("EvaluationRules", () => {
  it("opens grading at the due date, while the project is published", () => {
    expect(
      codeOf(() =>
        rules.assertGradingOpen(cycle, m1, new Date(at(15).getTime() - 1)),
      ),
    ).toBe("GRADING_NOT_OPEN");
    expect(
      codeOf(() => rules.assertGradingOpen(cycle, m1, at(15))),
    ).toBeUndefined();
    for (const status of ["DRAFT", "CLOSED"]) {
      expect(
        codeOf(() =>
          rules.assertGradingOpen(
            { ...cycle, status } as GradingCycle,
            m1,
            at(20),
          ),
        ),
      ).toBe("GRADING_CLOSED");
    }
    expect(codeOf(() => rules.milestoneOf(cycle, "other"))).toBe(
      "MILESTONE_NOT_FOUND",
    );
  });

  it("keeps marks within the scale, and the scale above every mark given", () => {
    expect(rules.clean({ marks: 14.5, feedback: " Good " }, grading())).toEqual(
      { marks: 14.5, feedback: "Good" },
    );
    expect(
      codeOf(() => rules.clean({ marks: 21, feedback: null }, grading())),
    ).toBe("INVALID_MARKS");
    expect(
      codeOf(() => rules.clean({ marks: -1, feedback: null }, grading())),
    ).toBe("INVALID_MARKS");
    expect(
      codeOf(() => rules.clean({ marks: 1.234, feedback: null }, grading())),
    ).toBe("INVALID_MARKS");
    expect(
      codeOf(() =>
        rules.clean({ marks: 5, feedback: null }, grading({ maxMarks: null })),
      ),
    ).toBe("MAX_MARKS_NOT_SET");
    expect(rules.checkMaxMarks(cycle, 20, 18)).toBe(20);
    expect(codeOf(() => rules.checkMaxMarks(cycle, 15, 18))).toBe(
      "MAX_MARKS_BELOW_EXISTING",
    );
    expect(codeOf(() => rules.checkMaxMarks(cycle, 0, null))).toBe(
      "INVALID_MAX_MARKS",
    );
    expect(codeOf(() => rules.checkMaxMarks(cycle, 1001, null))).toBe(
      "INVALID_MAX_MARKS",
    );
    expect(
      codeOf(() =>
        rules.checkMaxMarks(
          { ...cycle, status: "CLOSED" } as GradingCycle,
          20,
          null,
        ),
      ),
    ).toBe("GRADING_CLOSED");
  });

  it("takes feedback without marks, but not an empty save", () => {
    expect(
      rules.clean(
        { marks: null, feedback: "Clear plan" },
        grading({ maxMarks: null }),
      ),
    ).toEqual({
      marks: null,
      feedback: "Clear plan",
    });
    expect(
      codeOf(() => rules.clean({ marks: null, feedback: "   " }, grading())),
    ).toBe("EMPTY_EVALUATION");
  });

  it("numbers versions and refuses a save based on another version, or none", () => {
    expect(rules.nextVersion(null)).toBe(1);
    expect(rules.nextVersion(null, 0)).toBe(1);
    expect(codeOf(() => rules.nextVersion(null, 2))).toBe("EVALUATION_CHANGED");
    expect(rules.nextVersion(evaluation(2), 2)).toBe(3);
    expect(codeOf(() => rules.nextVersion(evaluation(2), 1))).toBe(
      "EVALUATION_CHANGED",
    );
    expect(codeOf(() => rules.nextVersion(evaluation(2)))).toBe(
      "EVALUATION_CHANGED",
    );
  });

  it("releases once, and only with a graded team; a later change shows as updated", () => {
    expect(codeOf(() => rules.assertCanRelease(grading(), 0))).toBe(
      "NOTHING_TO_RELEASE",
    );
    expect(codeOf(() => rules.assertCanRelease(null, 0))).toBe(
      "NOTHING_TO_RELEASE",
    );
    expect(codeOf(() => rules.assertCanRelease(grading(), 2))).toBeUndefined();
    expect(
      codeOf(() => rules.assertCanRelease(grading({ releasedAt: at(17) }), 2)),
    ).toBe("ALREADY_RELEASED");
    expect(
      rules.isUpdatedAfterRelease(
        { updatedAt: at(18) },
        { releasedAt: at(17) },
      ),
    ).toBe(true);
    expect(
      rules.isUpdatedAfterRelease(
        { updatedAt: at(16) },
        { releasedAt: at(17) },
      ),
    ).toBe(false);
    expect(
      rules.isUpdatedAfterRelease({ updatedAt: at(18) }, { releasedAt: null }),
    ).toBe(false);
  });
});
