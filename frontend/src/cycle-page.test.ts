import { describe, expect, it } from "vitest";
import {
  attentionItems,
  catalogSummary,
  cycleFacts,
  PAGE_PARTS,
  phaseOf,
  primaryAction,
  sectionFor,
  shows,
  showsCompletion,
  submissionSummary,
  teamsEmpty,
  type CycleCounts,
} from "./cycle-page";
import type { Cycle } from "./types";

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
  createdAt: "2026-10-27T05:00:00.000Z",
  publishedAt: "2026-10-28T05:00:00.000Z",
  closedAt: null,
  updatedAt: "2026-10-28T05:00:00.000Z",
  teamFormationDeadline: "2026-11-04T18:29:00.000Z",
  teamCompletionDeadline: "2026-11-06T18:29:00.000Z",
  ideaDeadline: "2026-11-13T18:29:00.000Z",
  submissionStartAt: "2026-11-13T18:30:00.000Z",
  submissionDeadline: "2026-12-12T18:29:00.000Z",
};
const elective: Cycle = { ...cycle, kind: "ELECTIVE" };
const at = (iso: string) => Date.parse(iso);

describe("phaseOf", () => {
  it.each([
    ["2026-11-01T00:00:00.000Z", "teams"],
    ["2026-11-05T00:00:00.000Z", "placing"],
    ["2026-11-10T00:00:00.000Z", "ideas"],
    ["2026-11-20T00:00:00.000Z", "work"],
    ["2026-12-20T00:00:00.000Z", "ended"],
  ] as const)("on %s is %s", (now, phase) => {
    expect(phaseOf(cycle, at(now))).toBe(phase);
  });

  it("follows the status for drafts and closed cycles; a draft opens its idea list", () => {
    expect(phaseOf({ ...cycle, status: "DRAFT" }, at("2026-11-20T00:00:00.000Z"))).toBe("draft");
    expect(phaseOf({ ...cycle, status: "CLOSED" }, at("2026-11-01T00:00:00.000Z"))).toBe("closed");
    expect(sectionFor("draft")).toBe("catalog");
    expect(sectionFor("placing")).toBeNull();
  });
});

describe("PAGE_PARTS", () => {
  it("shows an elective only its teams, submissions and students; a core course also its idea list and team completion", () => {
    expect(PAGE_PARTS.ELECTIVE).toEqual(["teamsList", "submissionCount", "studentsLink"]);
    expect(shows("ELECTIVE", "ideaList")).toBe(false);
    expect(shows("ELECTIVE", "teamCompletion")).toBe(false);
    expect(shows("CORE", "ideaList")).toBe(true);
    expect(shows("CORE", "teamCompletion")).toBe(true);
    for (const part of PAGE_PARTS.ELECTIVE) expect(shows("CORE", part)).toBe(true);
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
    submissions: { submitted: 0 },
  };
  const quiet: CycleCounts = { ...counts, unplaced: 0, ideas: { waiting: 0, approved: 6, rejected: 0, none: 0 } };

  it("picks one primary action from the cycle's state", () => {
    expect(primaryAction(cycle, "draft", {})).toEqual({ kind: "publish", label: "Publish to students" });
    expect(primaryAction(elective, "teams", { ...counts, roster: { total: 0, notSignedIn: 0 } })).toEqual({
      kind: "go",
      label: "Enroll students",
      target: "students",
    });
    expect(primaryAction(cycle, "teams", { ...quiet, roster: { total: 0, notSignedIn: 0 } })).toMatchObject({
      label: "Add students",
    });
    expect(primaryAction(cycle, "teams", quiet)).toEqual({ kind: "go", label: "See the teams", target: "teams" });
    expect(primaryAction(cycle, "placing", counts)).toMatchObject({ label: "Place 3 students", target: "completion" });
    expect(primaryAction(cycle, "ideas", counts)).toEqual({ kind: "go", label: "Review 2 proposals", target: "review" });
    expect(primaryAction(cycle, "work", quiet)).toMatchObject({ label: "See the submissions" });
    expect(primaryAction(cycle, "ended", quiet)).toEqual({ kind: "close", label: "Close the project" });
    // A closed cycle has nothing left to do.
    expect(primaryAction(cycle, "closed", counts)).toBeNull();
  });

  it("lists only real actions, pending proposals included, and nothing when there is none", () => {
    expect(attentionItems(cycle, "placing", counts).map((item) => item.text)).toEqual([
      "3 students have no team",
      "2 proposals are waiting for your review",
    ]);
    // Teams without an approved idea are not something the faculty can act on.
    expect(attentionItems(cycle, "work", { ...quiet, ideas: { waiting: 0, approved: 4, rejected: 1, none: 1 } })).toEqual([]);
    expect(attentionItems(elective, "draft", { roster: { total: 0, notSignedIn: 0 } })).toMatchObject([
      { text: "No students are enrolled yet", action: "Enroll students", target: "students" },
    ]);
    expect(attentionItems(cycle, "closed", counts)).toEqual([]);
  });
});

describe("team completion and empty states", () => {
  it("shows no team completion at all for a cycle with no students, a draft or an elective", () => {
    const counts = { roster: { total: 0, notSignedIn: 0 }, unplaced: 0 };
    expect(showsCompletion(cycle, "teams", counts)).toBe(false);
    expect(showsCompletion(cycle, "teams", {})).toBe(false);
    expect(showsCompletion(cycle, "draft", { roster: { total: 5, notSignedIn: 0 } })).toBe(false);
    expect(showsCompletion(elective, "placing", { roster: { total: 5, notSignedIn: 0 } })).toBe(false);
    expect(showsCompletion(cycle, "placing", { roster: { total: 5, notSignedIn: 0 } })).toBe(true);
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
  const counts: CycleCounts = {
    catalog: { offered: 1, picked: 0 },
    teams: 0,
    submissions: { submitted: 0 },
  };

  it("counts submissions without repeating any date", () => {
    expect(submissionSummary("teams", counts)).toBe("No teams yet");
    expect(submissionSummary("work", { ...counts, teams: 15, submissions: { submitted: 12 } })).toBe(
      "12 of 15 teams submitted",
    );
    expect(submissionSummary("work", { ...counts, teams: undefined })).toBe("Loading…");
  });

  it("speaks in the past tense once the cycle is closed", () => {
    expect(catalogSummary("teams", counts)).toBe("1 idea offered · not picked yet");
    expect(catalogSummary("closed", counts)).toBe("1 idea was offered · none was picked");
    expect(submissionSummary("closed", counts)).toBe("No work was submitted");
  });
});
