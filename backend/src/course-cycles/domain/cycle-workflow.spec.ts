import { CycleDomainError } from "./cycle.errors";
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
    expect(workflow.editableFields("PUBLISHED")).toEqual([
      "description",
      "submissionDeadline",
    ]);
    expect(workflow.editableFields("CLOSED")).toEqual([]);
  });

  it("rejects an invalid publish deadline", () => {
    expect(() =>
      workflow.validatePublishRules(
        new Date("2026-10-02T10:00:00.000Z"),
        new Date("2026-10-02T10:00:00.000Z"),
      ),
    ).toThrow(CycleDomainError);
  });
});
