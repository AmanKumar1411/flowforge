import { CycleWorkflow } from "../domain/cycle-workflow";
import { aCycle } from "./cycle.builder";

describe("aCycle", () => {
  it("builds a draft with no milestones by default", () => {
    const cycle = aCycle().build();

    expect(cycle.status).toBe("DRAFT");
    expect(cycle.publishedAt).toBeNull();
    expect(cycle.milestones).toEqual([]);
  });

  it("builds a published cycle with its milestones in order", () => {
    const cycle = aCycle().published().withMilestones(3).build();

    expect(cycle.status).toBe("PUBLISHED");
    expect(cycle.publishedAt).not.toBeNull();
    expect(cycle.milestones.map((m) => m.position)).toEqual([1, 2, 3]);
    expect(cycle.milestones.every((m) => m.cycleId === cycle.id)).toBe(true);
  });

  it("builds what the workflow accepts for publishing", () => {
    const cycle = aCycle().withMilestones(10).build();

    expect(new CycleWorkflow().publishProblems(cycle)).toEqual([]);
  });

  it("gives what create takes, matching what build returns", () => {
    const builder = aCycle().elective().ownedBy("f").forBatch(2024);

    expect(builder.buildCreateData()).toMatchObject({
      kind: "ELECTIVE",
      createdByFacultyId: "f",
      batchYear: 2024,
    });
    expect(builder.build()).toMatchObject(builder.buildCreateData());
  });

  it("places the dates around a given moment", () => {
    const start = new Date("2026-11-06T00:00:00.000Z");

    expect(aCycle().startingAt(start).build().teamDeadline).toEqual(
      new Date("2026-11-07T00:00:00.000Z"),
    );
  });
});
