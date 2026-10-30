import { describe, expect, it } from "vitest";
import { gradingCounts, marksText, parseMarks, releaseConfirmText } from "./grading";
import { projectPath, tabOf, todosFor, upNextLink, upNextText } from "./student-dashboard";
import type { Grading, UpNextItem } from "./types";

const cycle = { id: "c1", courseName: "SD", title: "Project", kind: "CORE" as const, status: "PUBLISHED" as const };
const todo: UpNextItem = { cycle, kind: "SUBMIT_IDEA", at: "2026-11-04T18:29:00.000Z", text: "Submit or pick your team's idea", action: { tab: "idea", actionable: true } };
const date: UpNextItem = { cycle, kind: "TEAM_DEADLINE", at: "2026-11-04T18:29:00.000Z", text: "Team deadline" };

describe("student dashboard words and links", () => {
  it("says a deadline as 'by' for things to do and as a date otherwise, each linked to its tab", () => {
    expect(upNextText(todo)).toMatch(/^Submit or pick your team's idea by \w{3}, \d+ \w{3} 2026/);
    expect(upNextText(date)).toMatch(/^Team deadline: /);
    expect(upNextText({ ...todo, at: null })).toBe("Submit or pick your team's idea");
    expect(upNextLink(todo)).toBe("/student/projects/c1?tab=idea");
    expect(upNextLink(date)).toBe("/student/projects/c1");
    expect(projectPath("c1", "milestones")).toBe("/student/projects/c1?tab=milestones");
    expect(tabOf("idea")).toBe("idea");
    expect(tabOf("grades")).toBe("overview");
    expect(todosFor("c1", [date, todo, { ...todo, cycle: { ...cycle, id: "c2" } }])).toEqual([todo]);
  });
});

describe("grading words", () => {
  const grading: Grading = {
    milestone: { id: "m1", position: 1, name: "Design review", submissionDueAt: "2026-11-15T18:29:00.000Z" },
    maxMarks: 20,
    releasedAt: null,
    open: true,
    rows: [
      { team: { id: "t1", name: "Falcon", memberCount: 2 }, evaluation: { id: "e1", marks: 14, feedback: null, version: 1, updatedAt: "" }, latestWork: { version: 2, submittedAt: "" } },
      { team: { id: "t2", name: "Kestrel", memberCount: 1 }, evaluation: null, latestWork: null },
    ],
  };

  it("counts graded and ungraded teams and flags those without work", () => {
    expect(gradingCounts(grading)).toEqual({ graded: 1, ungraded: 1, noSubmission: 1 });
    expect(releaseConfirmText(grading)).toMatch(/1 team is graded; 1 team is not graded yet/);
  });

  it("writes marks out of the scale, and reads a marks field", () => {
    expect(marksText({ marks: 14, maxMarks: 20 })).toBe("14 / 20");
    expect(marksText({ marks: 14.5, maxMarks: 20 })).toBe("14.5 / 20");
    expect(marksText({ marks: null, maxMarks: 20 })).toBeNull();
    expect(parseMarks(" 14.5 ")).toEqual({ marks: 14.5, problem: null });
    expect(parseMarks("")).toEqual({ marks: null, problem: null });
    expect(parseMarks("14.555").problem).toMatch(/number/);
    expect(parseMarks("-1").problem).toMatch(/number/);
  });
});
