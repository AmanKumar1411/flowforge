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
      ]),
    );
    expect(workflow.editableFields("PUBLISHED")).toEqual([
      "description",
      "submissionDeadline",
      "teamFormationDeadline",
    ]);
    expect(workflow.editableFields("CLOSED")).toEqual([]);
  });

  const schedule = (overrides: Partial<CycleSchedule> = {}): CycleSchedule => ({
    submissionStartAt: new Date("2026-11-01T09:00:00.000Z"),
    submissionDeadline: new Date("2026-12-01T17:00:00.000Z"),
    minTeamSize: 2,
    maxTeamSize: 4,
    teamFormationDeadline: new Date("2026-11-01T09:00:00.000Z"),
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

  it("requires team formation to end before the submission deadline", () => {
    expect(
      codeOf(() =>
        workflow.assertValidSchedule(
          schedule({
            teamFormationDeadline: new Date("2026-12-01T17:00:00.000Z"),
          }),
        ),
      ),
    ).toBe("INVALID_TEAM_FORMATION_DEADLINE");
    // Formation may end after submissions open, as long as it ends before the deadline.
    expect(() =>
      workflow.assertValidSchedule(
        schedule({
          teamFormationDeadline: new Date("2026-11-15T09:00:00.000Z"),
        }),
      ),
    ).not.toThrow();
  });

  describe("moving the formation deadline of a published cycle", () => {
    const now = new Date("2026-10-27T12:00:00.000Z");
    const open = new Date("2026-10-30T12:00:00.000Z");
    const passed = new Date("2026-10-27T11:59:59.000Z");

    it("allows an extension while formation is open", () => {
      expect(() =>
        workflow.assertTeamDeadlineChange(
          open,
          new Date("2026-11-05T12:00:00.000Z"),
          now,
        ),
      ).not.toThrow();
    });

    it("never reopens formation that has ended", () => {
      expect(
        codeOf(() =>
          workflow.assertTeamDeadlineChange(
            passed,
            new Date("2026-11-05T12:00:00.000Z"),
            now,
          ),
        ),
      ).toBe("CYCLE_FIELD_LOCKED");
      // Exactly at the deadline counts as ended.
      expect(
        codeOf(() => workflow.assertTeamDeadlineChange(now, open, now)),
      ).toBe("CYCLE_FIELD_LOCKED");
    });

    it("refuses a new deadline in the past", () => {
      expect(
        codeOf(() => workflow.assertTeamDeadlineChange(open, passed, now)),
      ).toBe("INVALID_TEAM_FORMATION_DEADLINE");
    });
  });
});
