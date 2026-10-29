import { describe, expect, it } from "vitest";
import {
  blankState,
  milestoneProblems,
  newMilestone,
  payloadOf,
  stateFromCycle,
  teamsProblems,
  updatePayload,
  visibleSteps,
  withIdeaDeadline,
  type WizardState,
} from "./cycle-wizard";
import type { Cycle } from "./types";

const today = new Date(2026, 9, 29, 10, 0);
const blank = (): WizardState => ({
  ...blankState([], today),
  courseName: "Software Design",
  title: "Mid-semester project",
  batchYear: 2023,
});

const cycle: Cycle = {
  id: "cycle",
  courseName: "Software Design",
  title: "Mid-semester project",
  description: null,
  batchYear: 2023,
  semester: 7,
  academicYear: "2026-27",
  minTeamSize: 2,
  maxTeamSize: 4,
  kind: "CORE",
  status: "PUBLISHED",
  teamDeadline: "2026-11-04T18:29:00.000Z",
  ideaDeadline: "2026-11-11T18:29:00.000Z",
  ideaSource: "BOTH",
  ideaLinkRequirement: { required: [], optional: ["GITHUB", "DRIVE"] },
  milestones: [
    {
      id: "m1",
      position: 1,
      name: "Design review",
      description: null,
      submissionOpensAt: "2026-10-20T18:30:00.000Z",
      submissionDueAt: "2026-11-25T18:29:00.000Z",
      evaluationAt: "2026-11-26T18:29:00.000Z",
      linkRequirement: { required: ["GITHUB"], optional: [] },
    },
    {
      id: "m2",
      position: 2,
      name: "Final",
      description: null,
      submissionOpensAt: "2026-11-25T18:29:00.000Z",
      submissionDueAt: "2026-12-10T18:29:00.000Z",
      evaluationAt: "2026-12-10T18:29:00.000Z",
      linkRequirement: { required: ["DRIVE"], optional: [] },
    },
  ],
  currentStage: { kind: "TEAMS" },
  nextEvents: [],
  createdAt: "2026-10-27T05:00:00.000Z",
  publishedAt: "2026-10-28T05:00:00.000Z",
  closedAt: null,
  updatedAt: "2026-10-28T05:00:00.000Z",
};

describe("cycle-wizard", () => {
  it("starts a blank project in the semester's term, with one milestone after the idea deadline", () => {
    const state = blankState([], today);
    expect(state.semester).toBe(currentSemesterOf(state.batchYear));
    expect(state.academicYear).toMatch(/^\d{4}-\d{2}$/);
    expect(state.milestones).toHaveLength(1);
    expect(Date.parse(state.milestones[0].opensAt)).toBeGreaterThan(Date.parse(state.ideaDeadline));
    expect(milestoneProblems(blank(), "create", null, today)).toEqual({});
    expect(payloadOf(blank()).milestones[0].linkRequirement).toEqual({
      required: ["GITHUB"],
      optional: ["DEMO", "REPORT"],
    });
  });

  it("shows the idea list step only when teams can pick from a list", () => {
    expect(visibleSteps({ ideaSource: "BOTH" })).toContain("ideas");
    expect(visibleSteps({ ideaSource: "STUDENT_PROPOSALS" })).not.toContain("ideas");
  });

  it("moves milestones after a later idea deadline, keeping their spacing", () => {
    const state = blank();
    const later = withIdeaDeadline(state, state.milestones[0].dueAt, "draft");
    const [before, after] = [state.milestones[0], later.milestones[0]];
    expect(Date.parse(after.opensAt)).toBeGreaterThan(Date.parse(later.ideaDeadline));
    expect(Date.parse(after.dueAt) - Date.parse(after.opensAt)).toBe(Date.parse(before.dueAt) - Date.parse(before.opensAt));
    expect(withIdeaDeadline(state, state.teamDeadline, "draft").milestones).toEqual(state.milestones);
  });

  it("needs the idea deadline after the team deadline", () => {
    const state = { ...blank(), ideaDeadline: blank().teamDeadline };
    expect(teamsProblems(state, "create", null, today).ideaDeadline).toMatch(/after the team deadline/);
  });

  it("flags overlapping milestones, a first one before the idea deadline, and bad dates", () => {
    const state = blank();
    const second = newMilestone(state);
    const overlapping = { ...state, milestones: [state.milestones[0], { ...second, opensAt: state.milestones[0].opensAt }] };
    expect(milestoneProblems(overlapping, "create", null, today)["m1.opensAt"]).toMatch(/Overlaps M1/);
    const early = { ...state, milestones: [{ ...state.milestones[0], opensAt: state.teamDeadline }] };
    expect(milestoneProblems(early, "create", null, today)["m0.opensAt"]).toMatch(/before the idea deadline/);
    const backwards = { ...state, milestones: [{ ...state.milestones[0], evaluationAt: state.milestones[0].opensAt }] };
    expect(milestoneProblems(backwards, "create", null, today)["m0.evaluationAt"]).toMatch(/before submissions are due/);
    const twins = { ...state, milestones: [state.milestones[0], { ...second, name: state.milestones[0].name }] };
    expect(milestoneProblems(twins, "create", null, today)["m1.name"]).toBe("Another milestone has this name.");
    expect(milestoneProblems({ ...state, milestones: [] }, "create", null, today).milestones).toBe("Add at least one milestone.");
  });

  it("sends only what changed on a published project, milestones with their ids", () => {
    const state = stateFromCycle(cycle);
    expect(updatePayload(state, cycle, "published")).toEqual({});
    const moved = { ...state, milestones: [state.milestones[0], { ...state.milestones[1], description: "Bring the deck" }] };
    const changes = updatePayload(moved, cycle, "published");
    expect(Object.keys(changes)).toEqual(["milestones"]);
    expect(changes.milestones?.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(changes.milestones?.[1].description).toBe("Bring the deck");
  });
});

function currentSemesterOf(batchYear: number) {
  const years = today.getFullYear() - batchYear;
  return Math.min(8, Math.max(1, today.getMonth() <= 5 ? years * 2 : years * 2 + 1));
}
