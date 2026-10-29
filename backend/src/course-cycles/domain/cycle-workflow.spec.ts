import { CycleDomainError } from "./cycle.errors";
import { CycleSchedule } from "./cycle.types";
import { CycleWorkflow } from "./cycle-workflow";

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
    expect(workflow.editableFields("DRAFT")).toContain("title");
    expect(workflow.editableFields("DRAFT")).toEqual(
      expect.arrayContaining([
        "minTeamSize",
        "maxTeamSize",
        "teamFormationDeadline",
        "teamCompletionDeadline",
        "ideaDeadline",
        "kind",
      ]),
    );
    // Sizes and the course kind are fixed once students can act.
    expect(workflow.editableFields("PUBLISHED")).toEqual([
      "description",
      "submissionDeadline",
      "teamFormationDeadline",
      "teamCompletionDeadline",
      "ideaDeadline",
    ]);
    expect(workflow.editableFields("CLOSED")).toEqual([]);
  });

  // Formation, completion and ideas end one after another, before submissions open.
  const schedule = (overrides: Partial<CycleSchedule> = {}): CycleSchedule => ({
    submissionStartAt: new Date("2026-11-10T09:00:00.000Z"),
    submissionDeadline: new Date("2026-12-01T17:00:00.000Z"),
    minTeamSize: 2,
    maxTeamSize: 4,
    teamFormationDeadline: new Date("2026-11-01T09:00:00.000Z"),
    teamCompletionDeadline: new Date("2026-11-08T09:00:00.000Z"),
    ideaDeadline: new Date("2026-11-09T09:00:00.000Z"),
    ...overrides,
  });
  const codeOf = (work: () => void): string | undefined => {
    try {
      work();
      return undefined;
    } catch (error) {
      return (error as CycleDomainError).code;
    }
  };

  it("rejects an invalid publish deadline", () => {
    expect(
      codeOf(() =>
        workflow.validatePublishRules(
          schedule({
            submissionStartAt: new Date("2026-10-02T10:00:00.000Z"),
            submissionDeadline: new Date("2026-10-02T10:00:00.000Z"),
          }),
        ),
      ),
    ).toBe("INVALID_DEADLINE");
  });

  it.each([
    [1, 1],
    [1, 10],
    [3, 3],
  ])("accepts team size %i to %i", (minTeamSize, maxTeamSize) => {
    expect(() =>
      workflow.assertValidSchedule(schedule({ minTeamSize, maxTeamSize })),
    ).not.toThrow();
  });

  it.each([
    [0, 4],
    [5, 4],
    [1, 11],
    [1.5, 4],
  ])("rejects team size %d to %d", (minTeamSize, maxTeamSize) => {
    expect(
      codeOf(() =>
        workflow.assertValidSchedule(schedule({ minTeamSize, maxTeamSize })),
      ),
    ).toBe("INVALID_TEAM_SIZE");
  });

  it("gives a faculty window length: it must end after the students' deadline", () => {
    const formation = new Date("2026-11-01T09:00:00.000Z");
    expect(() =>
      workflow.assertCompletionWindow(
        formation,
        new Date("2026-11-01T09:01:00.000Z"),
      ),
    ).not.toThrow();
    for (const completion of [
      formation,
      new Date("2026-10-31T09:00:00.000Z"),
    ]) {
      expect(
        codeOf(() => workflow.assertCompletionWindow(formation, completion)),
      ).toBe("INVALID_TEAM_COMPLETION_DEADLINE");
    }
  });

  it("requires team formation to end by the time submissions open", () => {
    const later = new Date("2026-11-15T09:00:00.000Z");
    expect(
      codeOf(() =>
        workflow.assertValidSchedule(
          schedule({
            teamFormationDeadline: later,
            teamCompletionDeadline: later,
            ideaDeadline: later,
          }),
        ),
      ),
    ).toBe("INVALID_TEAM_FORMATION_DEADLINE");
    // All three stages may end exactly when submissions open.
    const opening = new Date("2026-11-10T09:00:00.000Z");
    expect(() =>
      workflow.assertValidSchedule(
        schedule({
          teamFormationDeadline: opening,
          teamCompletionDeadline: opening,
          ideaDeadline: opening,
        }),
      ),
    ).not.toThrow();
  });

  describe("moving a stage deadline of a published cycle", () => {
    const now = new Date("2026-10-27T12:00:00.000Z");
    const open = new Date("2026-10-30T12:00:00.000Z");
    const passed = new Date("2026-10-27T11:59:59.000Z");

    it("allows an extension while formation is open", () => {
      expect(() =>
        workflow.assertStageDeadlineChange(
          "teamFormationDeadline",
          open,
          new Date("2026-11-05T12:00:00.000Z"),
          now,
        ),
      ).not.toThrow();
    });

    it("never reopens formation that has ended", () => {
      expect(
        codeOf(() =>
          workflow.assertStageDeadlineChange(
            "teamFormationDeadline",
            passed,
            new Date("2026-11-05T12:00:00.000Z"),
            now,
          ),
        ),
      ).toBe("CYCLE_FIELD_LOCKED");
      // Exactly at the deadline counts as ended.
      expect(
        codeOf(() =>
          workflow.assertStageDeadlineChange(
            "teamFormationDeadline",
            now,
            open,
            now,
          ),
        ),
      ).toBe("CYCLE_FIELD_LOCKED");
    });

    it("refuses a new deadline in the past", () => {
      expect(
        codeOf(() =>
          workflow.assertStageDeadlineChange(
            "teamFormationDeadline",
            open,
            passed,
            now,
          ),
        ),
      ).toBe("INVALID_TEAM_FORMATION_DEADLINE");
    });

    it("applies the same rules to the completion deadline, with its own code", () => {
      expect(
        codeOf(() =>
          workflow.assertStageDeadlineChange(
            "teamCompletionDeadline",
            passed,
            open,
            now,
          ),
        ),
      ).toBe("CYCLE_FIELD_LOCKED");
      expect(
        codeOf(() =>
          workflow.assertStageDeadlineChange(
            "teamCompletionDeadline",
            open,
            passed,
            now,
          ),
        ),
      ).toBe("INVALID_TEAM_COMPLETION_DEADLINE");
    });

    it("applies the same rules to the idea deadline, with its own code", () => {
      expect(
        codeOf(() =>
          workflow.assertStageDeadlineChange("ideaDeadline", passed, open, now),
        ),
      ).toBe("CYCLE_FIELD_LOCKED");
      expect(
        codeOf(() =>
          workflow.assertStageDeadlineChange("ideaDeadline", open, passed, now),
        ),
      ).toBe("INVALID_IDEA_DEADLINE");
    });
  });

  describe("the stage deadlines", () => {
    it("accept completion equal to formation: no faculty window", () => {
      expect(() =>
        workflow.assertValidSchedule(
          schedule({
            teamCompletionDeadline: new Date("2026-11-01T09:00:00.000Z"),
          }),
        ),
      ).not.toThrow();
    });

    it("refuse completion before formation", () => {
      expect(
        codeOf(() =>
          workflow.assertValidSchedule(
            schedule({
              teamCompletionDeadline: new Date("2026-10-31T09:00:00.000Z"),
            }),
          ),
        ),
      ).toBe("INVALID_TEAM_COMPLETION_DEADLINE");
    });

    it("refuse completion after submissions open", () => {
      expect(
        codeOf(() =>
          workflow.assertValidSchedule(
            schedule({
              teamCompletionDeadline: new Date("2026-11-12T09:00:00.000Z"),
              ideaDeadline: new Date("2026-11-12T09:00:00.000Z"),
            }),
          ),
        ),
      ).toBe("INVALID_TEAM_COMPLETION_DEADLINE");
    });

    it("accept ideas due when team completion ends, or when submissions open", () => {
      for (const ideaDeadline of [
        new Date("2026-11-08T09:00:00.000Z"),
        new Date("2026-11-10T09:00:00.000Z"),
      ]) {
        expect(() =>
          workflow.assertValidSchedule(schedule({ ideaDeadline })),
        ).not.toThrow();
      }
    });

    it("refuse ideas due before team completion ends or after submissions open", () => {
      for (const ideaDeadline of [
        new Date("2026-11-07T09:00:00.000Z"),
        new Date("2026-11-10T09:00:01.000Z"),
      ]) {
        expect(
          codeOf(() =>
            workflow.assertValidSchedule(schedule({ ideaDeadline })),
          ),
        ).toBe("INVALID_IDEA_DEADLINE");
      }
    });
  });
});
