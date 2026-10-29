import { FixedClock } from "../../common/testing/fixed-clock";
import {
  CycleTimeline,
  TimelineCycle,
  TimelineMilestone,
} from "./cycle-timeline";

const at = (day: number, hour = 12) => new Date(Date.UTC(2026, 10, day, hour));
const MINUTE = 60_000;

const milestone = (
  position: number,
  opens: number,
  due: number,
  evaluation: number,
): TimelineMilestone => ({
  id: `m${position}`,
  position,
  name: `M${position}`,
  submissionOpensAt: at(opens),
  submissionDueAt: at(due),
  evaluationAt: at(evaluation),
});

// Teams until the 4th, ideas until the 8th; M1 8th–15th (evaluated the 17th), M2 15th–22nd (the 22nd).
const cycle: TimelineCycle = {
  status: "PUBLISHED",
  teamDeadline: at(4),
  ideaDeadline: at(8),
  milestones: [milestone(1, 8, 15, 17), milestone(2, 15, 22, 22)],
};

function timelineAt(moment: Date) {
  const clock = new FixedClock(moment);
  return new CycleTimeline(clock);
}
const stageAt = (moment: Date, of: TimelineCycle = cycle) => {
  const stage = timelineAt(moment).currentStage(of);
  return stage.kind === "MILESTONE"
    ? `${stage.milestone.id} ${stage.phase}`
    : stage.kind;
};
const before = (date: Date) => new Date(date.getTime() - MINUTE);
const after = (date: Date) => new Date(date.getTime() + MINUTE);

describe("CycleTimeline.currentStage", () => {
  it("follows the status for drafts and closed cycles", () => {
    expect(stageAt(at(10), { ...cycle, status: "DRAFT" })).toBe("DRAFT");
    expect(stageAt(at(1), { ...cycle, status: "CLOSED" })).toBe("CLOSED");
  });

  it.each([
    ["just before the team deadline", before(at(4)), "TEAMS"],
    ["at the team deadline", at(4), "IDEAS"],
    ["just before the idea deadline", before(at(8)), "IDEAS"],
    ["at the idea deadline, when M1 opens", at(8), "m1 OPEN"],
    ["just before M1 is due", before(at(15)), "m1 OPEN"],
    ["when M1 is due and M2 opens", at(15), "m2 OPEN"],
    ["just before M2 is due", before(at(22)), "m2 OPEN"],
    ["when M2 is due and evaluated", at(22), "WRAP_UP"],
  ])("%s", (_, moment, stage) => {
    expect(stageAt(moment)).toBe(stage);
  });

  it("waits for an evaluation, then for the next milestone to open", () => {
    const spaced: TimelineCycle = {
      ...cycle,
      milestones: [milestone(1, 8, 15, 17), milestone(2, 19, 22, 23)],
    };
    expect(stageAt(at(15), spaced)).toBe("m1 AWAITING_EVALUATION");
    expect(stageAt(before(at(17)), spaced)).toBe("m1 AWAITING_EVALUATION");
    expect(stageAt(at(17), spaced)).toBe("m2 UPCOMING");
    expect(stageAt(after(at(19)), spaced)).toBe("m2 OPEN");
    expect(stageAt(at(22), spaced)).toBe("m2 AWAITING_EVALUATION");
    expect(stageAt(at(23), spaced)).toBe("WRAP_UP");
  });

  it("prefers an open milestone to one still waiting for its evaluation", () => {
    expect(stageAt(at(16))).toBe("m2 OPEN");
  });

  it("waits for the first milestone when it opens after the idea deadline", () => {
    const later = { ...cycle, milestones: [milestone(1, 10, 15, 17)] };
    expect(stageAt(at(9), later)).toBe("m1 UPCOMING");
  });
});

describe("CycleTimeline.upcomingEvents", () => {
  const events = (moment: Date, limit?: number, of: TimelineCycle = cycle) =>
    timelineAt(moment)
      .upcomingEvents(of, limit)
      .map(
        (event) =>
          `${event.kind}${event.milestone ? ` ${event.milestone.id}` : ""}`,
      );

  it("lists what comes next in time order, what closes before what opens", () => {
    expect(events(at(1), 10)).toEqual([
      "TEAM_DEADLINE",
      "IDEA_DEADLINE",
      "SUBMISSION_OPENS m1",
      "SUBMISSION_DUE m1",
      "SUBMISSION_OPENS m2",
      "EVALUATION m1",
      "SUBMISSION_DUE m2",
      "EVALUATION m2",
    ]);
  });

  it("treats an event at exactly now as past, and keeps to the limit", () => {
    expect(events(before(at(4)))).toEqual([
      "TEAM_DEADLINE",
      "IDEA_DEADLINE",
      "SUBMISSION_OPENS m1",
    ]);
    expect(events(at(4))).toEqual([
      "IDEA_DEADLINE",
      "SUBMISSION_OPENS m1",
      "SUBMISSION_DUE m1",
    ]);
    expect(events(after(at(4)), 1)).toEqual(["IDEA_DEADLINE"]);
    expect(events(at(22))).toEqual([]);
  });

  it("has nothing ahead for a closed cycle", () => {
    expect(events(at(1), 10, { ...cycle, status: "CLOSED" })).toEqual([]);
  });
});
