import { LinkRequirement } from "../../common/links/link-requirement";
import { CycleDomainError } from "./cycle.errors";
import {
  Milestone,
  MilestoneInput,
  planMilestones,
  unknownIds,
} from "./milestone";
import { MilestoneSchedule, ScheduleInput } from "./milestone-schedule";

const day = (n: number) => new Date(Date.UTC(2026, 10, n, 18, 30));
const github = LinkRequirement.MILESTONE_DEFAULT;

const input = (
  name: string,
  opens: number,
  due: number,
  evaluation: number,
  id?: string,
): MilestoneInput => ({
  id,
  name,
  description: null,
  submissionOpensAt: day(opens),
  submissionDueAt: day(due),
  evaluationAt: day(evaluation),
  linkRequirement: github,
});

const valid: ScheduleInput = {
  teamDeadline: day(4),
  ideaDeadline: day(8),
  milestones: [
    input("Design review", 8, 15, 16),
    input("Beta", 15, 22, 22),
    input("Final", 23, 30, 30),
  ],
};

const codes = (schedule: ScheduleInput, forPublish = false) =>
  new MilestoneSchedule()
    .problems(schedule, { forPublish })
    .map((problem) => problem.code);

const thrown = (work: () => void): string | undefined => {
  try {
    work();
  } catch (error) {
    if (error instanceof CycleDomainError) return error.code;
    throw error;
  }
  return undefined;
};

describe("MilestoneSchedule", () => {
  const schedule = new MilestoneSchedule();
  const withMilestones = (...milestones: MilestoneInput[]): ScheduleInput => ({
    ...valid,
    milestones,
  });

  it("accepts teams, then ideas, then milestones back to back", () => {
    expect(codes(valid, true)).toEqual([]);
    expect(() => schedule.assertValid(valid)).not.toThrow();
  });

  it("refuses a milestone that opens at or after it is due, or is evaluated before it is due", () => {
    expect(codes(withMilestones(input("M", 10, 10, 12)))).toEqual([
      "INVALID_MILESTONE_SCHEDULE",
    ]);
    expect(codes(withMilestones(input("M", 12, 10, 12)))).toEqual([
      "INVALID_MILESTONE_SCHEDULE",
    ]);
    expect(codes(withMilestones(input("M", 10, 12, 11)))).toEqual([
      "INVALID_MILESTONE_SCHEDULE",
    ]);
  });

  it("refuses a milestone opening before the previous one is due", () => {
    expect(
      codes(withMilestones(input("A", 8, 15, 16), input("B", 14, 20, 20))),
    ).toEqual(["INVALID_MILESTONE_SCHEDULE"]);
  });

  it("refuses a first milestone opening before the idea deadline", () => {
    expect(codes(withMilestones(input("A", 7, 15, 16)))).toEqual([
      "INVALID_MILESTONE_SCHEDULE",
    ]);
  });

  it("needs the idea deadline strictly after the team deadline", () => {
    expect(codes({ ...valid, ideaDeadline: day(4) })).toContain(
      "INVALID_IDEA_DEADLINE",
    );
    expect(codes({ ...valid, teamDeadline: day(9) })).toContain(
      "INVALID_IDEA_DEADLINE",
    );
  });

  it("allows a draft without milestones, but not publishing one; never more than 10", () => {
    expect(codes(withMilestones())).toEqual([]);
    expect(codes(withMilestones(), true)).toEqual(["NO_MILESTONES"]);
    const eleven = Array.from({ length: 11 }, (_, index) =>
      input(`M${index + 1}`, 8 + index, 9 + index, 9 + index),
    );
    expect(codes(withMilestones(...eleven))).toEqual([
      "INVALID_MILESTONE_COUNT",
    ]);
  });

  it("refuses two milestones with the same name, whatever the case, and an empty name", () => {
    expect(
      codes(
        withMilestones(input("Final", 8, 15, 16), input(" final ", 15, 20, 20)),
      ),
    ).toEqual(["DUPLICATE_MILESTONE_NAME"]);
    expect(codes(withMilestones(input("  ", 8, 15, 16)))).toEqual([
      "INVALID_MILESTONE",
    ]);
  });

  it("reports every problem at once, and throws the first", () => {
    const broken = {
      ...valid,
      ideaDeadline: day(4),
      milestones: [input("A", 3, 2, 1)],
    };
    expect(codes(broken, true)).toEqual([
      "INVALID_IDEA_DEADLINE",
      "INVALID_MILESTONE_SCHEDULE",
      "INVALID_MILESTONE_SCHEDULE",
      "INVALID_MILESTONE_SCHEDULE",
    ]);
    expect(thrown(() => schedule.assertValid(broken))).toBe(
      "INVALID_IDEA_DEADLINE",
    );
  });
});

describe("MilestoneSchedule after publishing (A3)", () => {
  const schedule = new MilestoneSchedule();
  const now = day(12);
  const stored = (raw: MilestoneInput, position: number): Milestone => ({
    ...raw,
    id: raw.id!,
    cycleId: "cycle",
    position,
    createdAt: day(1),
    updatedAt: day(1),
  });
  const current = [
    stored(input("Design review", 8, 15, 16, "m1"), 1),
    stored(input("Final", 23, 30, 30, "m2"), 2),
  ];
  const same: MilestoneInput[] = current.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    submissionOpensAt: m.submissionOpensAt,
    submissionDueAt: m.submissionDueAt,
    evaluationAt: m.evaluationAt,
    linkRequirement: m.linkRequirement,
  }));
  const change = (attempt: MilestoneInput[]) =>
    thrown(() => schedule.assertPublishedChange(current, attempt, now));

  it("moves a milestone that has not opened, to the future", () => {
    expect(change([same[0], input("Final", 24, 31, 31, "m2")])).toBeUndefined();
    expect(
      change([same[0], { ...same[1], description: "Bring a demo" }]),
    ).toBeUndefined();
  });

  it("refuses to change a milestone that has opened", () => {
    expect(change([input("Design review", 8, 16, 16, "m1"), same[1]])).toBe(
      "MILESTONE_LOCKED",
    );
    expect(change([{ ...same[0], description: "New" }, same[1]])).toBe(
      "MILESTONE_LOCKED",
    );
  });

  it("refuses to move a milestone into the past", () => {
    expect(change([same[0], input("Final", 11, 30, 30, "m2")])).toBe(
      "INVALID_MILESTONE_SCHEDULE",
    );
  });

  it("refuses to add, remove or reorder milestones, or rename one", () => {
    expect(change([...same, input("Extra", 30, 31, 31)])).toBe(
      "MILESTONES_LOCKED",
    );
    expect(change([same[0]])).toBe("MILESTONES_LOCKED");
    expect(change([same[1], same[0]])).toBe("MILESTONES_LOCKED");
    expect(change([same[0], { ...same[1], name: "Finale" }])).toBe(
      "MILESTONE_LOCKED",
    );
    expect(
      change([
        same[0],
        {
          ...same[1],
          linkRequirement: LinkRequirement.from({
            required: ["DRIVE"],
            optional: [],
          }),
        },
      ]),
    ).toBe("MILESTONE_LOCKED");
  });
});

describe("planMilestones", () => {
  it("keeps ids, places by order, and removes what is left out", () => {
    const plan = planMilestones(
      [{ id: "m1" }, { id: "m2" }],
      [input("New first", 8, 9, 9), input("Was M2", 10, 11, 11, "m2")],
    );
    expect(plan.create.map((m) => [m.name, m.position])).toEqual([
      ["New first", 1],
    ]);
    expect(plan.update.map((m) => [m.id, m.position])).toEqual([["m2", 2]]);
    expect(plan.remove).toEqual(["m1"]);
    expect(
      unknownIds(
        [{ id: "m1" }],
        [
          input("A", 8, 9, 9, "m9"),
          input("B", 9, 10, 10, "m1"),
          input("C", 10, 11, 11, "m1"),
        ],
      ),
    ).toEqual(["m9", "m1"]);
  });
});
