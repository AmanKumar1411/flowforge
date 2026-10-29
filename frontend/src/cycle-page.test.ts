import { describe, expect, it } from "vitest";
import {
  attentionItems,
  phaseOf,
  primaryAction,
  sectionFor,
  sectionSummary,
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

  it("follows the status for drafts and closed cycles", () => {
    expect(phaseOf({ ...cycle, status: "DRAFT" }, at("2026-11-20T00:00:00.000Z"))).toBe("draft");
    expect(phaseOf({ ...cycle, status: "CLOSED" }, at("2026-11-01T00:00:00.000Z"))).toBe("closed");
    expect(sectionFor("placing")).toBe("teams");
    expect(sectionFor("closed")).toBe("submissions");
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

  it("offers one primary action that fits the phase", () => {
    expect(primaryAction("draft", {})).toEqual({ kind: "publish", label: "Publish to students" });
    expect(primaryAction("placing", counts)).toMatchObject({ label: "Place 3 students", section: "teams" });
    expect(primaryAction("ideas", counts)).toMatchObject({ label: "Review 2 ideas", section: "ideas" });
    expect(primaryAction("work", { ...counts, ideas: undefined })).toMatchObject({
      label: "View submissions",
    });
    expect(primaryAction("ended", {})).toEqual({ kind: "close", label: "Close the cycle" });
  });

  it("lists only real action items, and nothing for a closed cycle", () => {
    expect(attentionItems(cycle, "placing", counts).map((item) => item.text)).toEqual([
      "3 students have no team",
      "2 ideas are waiting for your review",
    ]);
    expect(
      attentionItems(cycle, "work", { ...counts, ideas: { waiting: 0, approved: 4, rejected: 1, none: 1 } }).map(
        (item) => item.text,
      ),
    ).toEqual(["2 teams have no approved idea, so they can't submit work"]);
    expect(attentionItems(cycle, "teams", { ...counts, ideas: { waiting: 0, approved: 0, rejected: 0, none: 6 } })).toEqual([]);
    expect(attentionItems({ ...cycle, kind: "ELECTIVE" }, "draft", { roster: { total: 0, notSignedIn: 0 } })).toMatchObject([
      { text: "No students are enrolled yet", action: "Enroll students" },
    ]);
    expect(attentionItems(cycle, "closed", counts)).toEqual([]);
  });
});

describe("sectionSummary", () => {
  const counts: CycleCounts = {
    roster: { total: 3, notSignedIn: 1 },
    catalog: { offered: 1, picked: 0 },
    teams: 0,
    unplaced: 3,
    ideas: { waiting: 0, approved: 0, rejected: 0, none: 0 },
    submissions: { submitted: 0 },
  };

  it("gives one helpful line instead of repeated empty tables", () => {
    expect(sectionSummary("students", cycle, "teams", counts)).toBe(
      "3 students in batch 2023 · 1 not signed in yet",
    );
    expect(sectionSummary("catalog", cycle, "teams", counts)).toBe("1 idea offered · not picked yet");
    expect(sectionSummary("teams", cycle, "teams", counts)).toBe(
      "No teams yet · students form teams until Wed, 4 Nov",
    );
    expect(sectionSummary("ideas", cycle, "teams", counts)).toBe("Ideas come once teams form");
    expect(sectionSummary("submissions", cycle, "teams", counts)).toBe(
      "Submissions come once teams form",
    );
  });

  it("speaks in the past tense once the cycle is closed", () => {
    expect(sectionSummary("catalog", cycle, "closed", counts)).toBe("1 idea was offered · none was picked");
    expect(sectionSummary("teams", cycle, "closed", counts)).toBe("No teams were formed");
    expect(sectionSummary("submissions", cycle, "closed", counts)).toBe("No work was submitted");
    expect(
      sectionSummary("submissions", cycle, "closed", { ...counts, teams: 4, submissions: { submitted: 3 } }),
    ).toBe("3 of 4 teams submitted work");
  });
});
