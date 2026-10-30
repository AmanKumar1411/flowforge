import { LinkRequirement } from "../../common/links/link-requirement";
import { CycleDomainError } from "./cycle.errors";
import { CycleSchedule } from "./cycle.types";
import { CycleWorkflow } from "./cycle-workflow";

const day = (n: number) => new Date(Date.UTC(2026, 10, n, 18, 30));

// Phase 8: one schedule of team and idea deadlines plus milestones (was a single submission window).
const schedule: CycleSchedule = {
  minTeamSize: 2,
  maxTeamSize: 4,
  teamDeadline: day(4),
  ideaDeadline: day(8),
  milestones: [
    {
      name: "Final",
      description: null,
      submissionOpensAt: day(8),
      submissionDueAt: day(20),
      evaluationAt: day(21),
      linkRequirement: LinkRequirement.MILESTONE_DEFAULT,
    },
  ],
};

const codeOf = (work: () => void): string | undefined => {
  try {
    work();
  } catch (error) {
    if (error instanceof CycleDomainError) return error.code;
    throw error;
  }
  return undefined;
};

describe("CycleWorkflow", () => {
  const workflow = new CycleWorkflow();

  it.each([
    ["DRAFT", "PUBLISH", "PUBLISHED"],
    ["PUBLISHED", "CLOSE", "CLOSED"],
  ] as const)("allows %s -> %s", (status, action, next) => {
    expect(workflow.transition(status, action)).toBe(next);
  });

  it.each([
    ["DRAFT", "CLOSE"],
    ["PUBLISHED", "PUBLISH"],
    ["CLOSED", "PUBLISH"],
    ["CLOSED", "CLOSE"],
  ] as const)("rejects %s -> %s", (status, action) => {
    expect(() => workflow.transition(status, action)).toThrow(CycleDomainError);
  });

  it("reports editable fields by state", () => {
    expect(workflow.editableFields("DRAFT")).toEqual(
      expect.arrayContaining([
        "title",
        "minTeamSize",
        "maxTeamSize",
        "teamDeadline",
        "ideaDeadline",
        "ideaSource",
        "ideaLinkRequirement",
        "kind",
        "milestones",
      ]),
    );
    // Sizes, the course kind and the idea rules are fixed once students can act.
    expect(workflow.editableFields("PUBLISHED")).toEqual([
      "description",
      "teamDeadline",
      "ideaDeadline",
      "milestones",
    ]);
    expect(workflow.editableFields("CLOSED")).toEqual([]);
    expect(codeOf(() => workflow.assertEditable("PUBLISHED", ["kind"]))).toBe(
      "CYCLE_FIELD_LOCKED",
    );
    expect(
      codeOf(() => workflow.assertEditable("PUBLISHED", ["ideaSource"])),
    ).toBe("CYCLE_FIELD_LOCKED");
    expect(
      codeOf(() => workflow.assertEditable("CLOSED", ["description"])),
    ).toBe("CYCLE_ALREADY_CLOSED");
    expect(
      codeOf(() =>
        workflow.assertEditable("PUBLISHED", ["milestones", "description"]),
      ),
    ).toBeUndefined();
  });

  it.each([
    [0, 4],
    [3, 2],
    [2, 11],
    [1.5, 4],
  ])("rejects team sizes %s to %s", (min, max) => {
    expect(
      codeOf(() =>
        workflow.assertValidSchedule({
          ...schedule,
          minTeamSize: min,
          maxTeamSize: max,
        }),
      ),
    ).toBe("INVALID_TEAM_SIZE");
  });

  it("checks the milestone schedule on every save, and needs a milestone only to publish", () => {
    expect(
      codeOf(() => workflow.assertValidSchedule(schedule)),
    ).toBeUndefined();
    expect(
      codeOf(() =>
        workflow.assertValidSchedule({ ...schedule, ideaDeadline: day(3) }),
      ),
    ).toBe("INVALID_IDEA_DEADLINE");
    expect(
      codeOf(() =>
        workflow.assertValidSchedule({ ...schedule, milestones: [] }),
      ),
    ).toBeUndefined();
    expect(
      workflow
        .publishProblems({ ...schedule, milestones: [], maxTeamSize: 11 })
        .map((p) => p.code),
    ).toEqual(["INVALID_TEAM_SIZE", "NO_MILESTONES"]);
    expect(workflow.publishProblems(schedule)).toEqual([]);
  });

  describe("moving a stage deadline of a published cycle", () => {
    const now = day(2);

    it("allows an extension while the stage is open", () => {
      expect(
        codeOf(() =>
          workflow.assertStageDeadlineChange(
            "teamDeadline",
            day(4),
            day(5),
            now,
          ),
        ),
      ).toBeUndefined();
    });

    it("never reopens a stage that has ended", () => {
      expect(
        codeOf(() =>
          workflow.assertStageDeadlineChange(
            "teamDeadline",
            day(1),
            day(5),
            now,
          ),
        ),
      ).toBe("CYCLE_FIELD_LOCKED");
      expect(
        codeOf(() =>
          workflow.assertStageDeadlineChange("teamDeadline", now, day(5), now),
        ),
      ).toBe("CYCLE_FIELD_LOCKED");
    });

    it("refuses a new deadline in the past, with each stage's own code", () => {
      expect(
        codeOf(() =>
          workflow.assertStageDeadlineChange(
            "teamDeadline",
            day(4),
            day(1),
            now,
          ),
        ),
      ).toBe("INVALID_TEAM_DEADLINE");
      expect(
        codeOf(() =>
          workflow.assertStageDeadlineChange("ideaDeadline", day(8), now, now),
        ),
      ).toBe("INVALID_IDEA_DEADLINE");
    });
  });
});
