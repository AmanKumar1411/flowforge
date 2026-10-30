import { describe, expect, it } from "vitest";
import {
  attentionItems,
  catalogSummary,
  cycleFacts,
  PAGE_PARTS,
  phaseOf,
  primaryAction,
  shows,
  showsCompletion,
  showsIdeaList,
  submissionSummary,
  teamsEmpty,
  type CycleCounts,
} from "./cycle-page";
import type { Cycle, Milestone } from "./types";

const milestone: Milestone = {
  id: "m1",
  position: 1,
  name: "Design review",
  description: null,
  submissionOpensAt: "2026-11-13T18:30:00.000Z",
  submissionDueAt: "2026-11-27T18:29:00.000Z",
  evaluationAt: "2026-11-28T18:29:00.000Z",
  linkRequirement: { required: ["GITHUB"], optional: [] },
};

// Phase 8: team and idea deadlines plus milestones; the stage comes from the API.
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
  ideaDeadline: "2026-11-13T18:29:00.000Z",
  ideaSource: "BOTH",
  ideaLinkRequirement: { required: [], optional: ["GITHUB", "DRIVE"] },
  milestones: [milestone],
  currentStage: { kind: "TEAMS" },
  nextEvents: [],
  createdAt: "2026-10-27T05:00:00.000Z",
  publishedAt: "2026-10-28T05:00:00.000Z",
  closedAt: null,
  updatedAt: "2026-10-28T05:00:00.000Z",
};
const elective: Cycle = { ...cycle, kind: "ELECTIVE" };

describe("phaseOf", () => {
  it.each([
    [{ kind: "DRAFT" }, "draft"],
    [{ kind: "TEAMS" }, "teams"],
    [{ kind: "IDEAS" }, "ideas"],
    [{ kind: "MILESTONE", milestone, phase: "OPEN" }, "milestones"],
    [{ kind: "WRAP_UP" }, "ended"],
    [{ kind: "CLOSED" }, "closed"],
  ] as const)("follows the API's stage %o: %s", (currentStage, phase) => {
    expect(phaseOf({ currentStage })).toBe(phase);
  });
});

describe("parts by course type and idea source", () => {
  it("shows team completion for a core course only, and the idea list where teams can pick from it", () => {
    expect(PAGE_PARTS.ELECTIVE).toEqual([]);
    expect(shows("CORE", "teamCompletion")).toBe(true);
    expect(shows("ELECTIVE", "teamCompletion")).toBe(false);
    expect(showsIdeaList({ ideaSource: "BOTH" })).toBe(true);
    expect(showsIdeaList({ ideaSource: "FACULTY_LIST" })).toBe(true);
    expect(showsIdeaList({ ideaSource: "STUDENT_PROPOSALS" })).toBe(false);
  });
});

describe("cycleFacts", () => {
  it("says who takes part, the team size and the semester's term in one line", () => {
    expect(cycleFacts(elective)).toBe(
      "Elective · open to enrolled students · Teams of 2–4 · Semester 7 (Aug–Dec 2026)",
    );
    expect(cycleFacts({ ...cycle, semester: 8, minTeamSize: 3, maxTeamSize: 3 })).toBe(
      "Core · open to all of batch 2023 · Teams of 3 · Semester 8 (Jan–May 2027)",
    );
    expect(cycleFacts({ ...cycle, minTeamSize: 1, maxTeamSize: 1 })).toMatch(/· Solo projects ·/);
  });
});

describe("what the page asks of the faculty", () => {
  const counts: CycleCounts = {
    roster: { total: 30, notSignedIn: 3 },
    teams: 6,
    unplaced: 3,
    ideas: { waiting: 2, approved: 3, rejected: 0, none: 1 },
    openMilestones: [],
  };
  const quiet: CycleCounts = { ...counts, unplaced: 0, ideas: { waiting: 0, approved: 6, rejected: 0, none: 0 } };
  const working: CycleCounts = { ...quiet, openMilestones: [{ milestone, submitted: 4, teams: 6 }] };

  it("picks one primary action from the cycle's state", () => {
    expect(primaryAction(cycle, "draft", {})).toEqual({ kind: "go", label: "Review and publish", target: "publish" });
    expect(primaryAction(elective, "teams", { ...counts, roster: { total: 0, notSignedIn: 0 } })).toEqual({
      kind: "go",
      label: "Enroll students",
      target: "students",
    });
    expect(primaryAction(cycle, "teams", { ...quiet, roster: { total: 0, notSignedIn: 0 } })).toMatchObject({
      label: "Add students",
    });
    expect(primaryAction(cycle, "teams", quiet)).toEqual({ kind: "go", label: "See the teams", target: "teams" });
    // A1: students without a team are placed while ideas are due.
    expect(primaryAction(cycle, "ideas", counts)).toMatchObject({ label: "Place 3 students", target: "completion" });
    expect(primaryAction(cycle, "milestones", counts)).toEqual({ kind: "go", label: "Review 2 proposals", target: "review" });
    expect(primaryAction(cycle, "milestones", working)).toMatchObject({
      label: "See M1 · Design review work",
      target: "milestones",
    });
    expect(primaryAction(cycle, "ended", quiet)).toEqual({ kind: "close", label: "Close the project" });
    // A closed cycle has nothing left to do.
    expect(primaryAction(cycle, "closed", counts)).toBeNull();
  });

  it("lists only real actions: placing, proposals, teams missing an open milestone", () => {
    expect(attentionItems(cycle, "ideas", counts).map((item) => item.text)).toEqual([
      "3 students have no team",
      "2 proposals are waiting for your review",
    ]);
    expect(attentionItems(cycle, "milestones", working)).toMatchObject([
      { text: "2 teams have not submitted M1 · Design review yet", target: "milestones" },
    ]);
    // Teams without an approved idea are not something the faculty can act on.
    expect(attentionItems(cycle, "milestones", { ...quiet, ideas: { waiting: 0, approved: 4, rejected: 1, none: 1 } })).toEqual([]);
    expect(attentionItems(elective, "draft", { roster: { total: 0, notSignedIn: 0 } })).toMatchObject([
      { text: "No students are enrolled yet", action: "Enroll students", target: "students" },
    ]);
    expect(attentionItems(cycle, "closed", counts)).toEqual([]);
  });
});

// Phase 9: due milestones ask the faculty to grade, then to release.
describe("grading in needs-attention", () => {
  it("lists teams still to grade, then a graded milestone not released yet", () => {
    const base: CycleCounts = { roster: { total: 5, notSignedIn: 0 }, openMilestones: [] };
    const queue = (graded: number, ungraded: number, released: boolean): CycleCounts => ({
      ...base,
      gradingQueue: [{ milestone: { id: "m1", position: 1, name: "Design review" }, graded, ungraded, released }],
    });
    expect(attentionItems(cycle, "milestones", queue(0, 12, false)).map((item) => item.text)).toEqual([
      "M1 · Design review due: 12 teams to grade",
    ]);
    expect(attentionItems(cycle, "milestones", queue(12, 0, false)).map((item) => item.text)).toEqual([
      "M1 · Design review graded, not released",
    ]);
    expect(attentionItems(cycle, "milestones", queue(12, 0, true))).toEqual([]);
  });
});

describe("team completion and empty states", () => {
  it("shows no team completion for a cycle with no students, a draft or an elective", () => {
    expect(showsCompletion(cycle, "teams", { roster: { total: 0, notSignedIn: 0 } })).toBe(false);
    expect(showsCompletion(cycle, "teams", {})).toBe(false);
    expect(showsCompletion(cycle, "draft", { roster: { total: 5, notSignedIn: 0 } })).toBe(false);
    expect(showsCompletion(elective, "ideas", { roster: { total: 5, notSignedIn: 0 } })).toBe(false);
    expect(showsCompletion(cycle, "ideas", { roster: { total: 5, notSignedIn: 0 } })).toBe(true);
  });

  it("says what comes next when there is no team", () => {
    expect(teamsEmpty(elective, "teams", { roster: { total: 0, notSignedIn: 0 } })).toEqual({
      text: "No teams yet. Enroll students so they can form teams.",
      action: { label: "Enroll students", target: "students" },
    });
    expect(teamsEmpty(cycle, "teams", { roster: { total: 9, notSignedIn: 0 } })).toEqual({
      text: "No teams yet. Students are forming their own teams now.",
    });
    expect(teamsEmpty(cycle, "draft", {}).text).toBe("No teams yet. Students form teams once you publish the project.");
    expect(teamsEmpty(cycle, "closed", {}).text).toBe("No teams were formed.");
  });
});

describe("summaries", () => {
  const counts: CycleCounts = { catalog: { offered: 1, picked: 0 }, teams: 0, openMilestones: [] };

  it("counts each open milestone's work without repeating a date", () => {
    expect(submissionSummary("teams", counts)).toBe("No teams yet");
    expect(
      submissionSummary("milestones", { ...counts, teams: 15, openMilestones: [{ milestone, submitted: 12, teams: 15 }] }),
    ).toBe("M1 · Design review: 12 of 15 teams submitted");
    expect(submissionSummary("milestones", { ...counts, teams: 15 })).toBe("No milestone is open now");
    expect(submissionSummary("milestones", { ...counts, teams: undefined })).toBe("Loading…");
  });

  it("speaks in the past tense once the cycle is closed", () => {
    expect(catalogSummary("teams", counts)).toBe("1 idea offered · not picked yet");
    expect(catalogSummary("closed", counts)).toBe("1 idea was offered · none was picked");
    expect(submissionSummary("closed", counts)).toBe("No work was submitted");
  });
});
