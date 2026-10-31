import { formatDate } from "./dates";
import type { Grading, TeamEvaluation } from "./types";

/**
 * Grading in words, free of React: the faculty's counts and confirmation, and
 * how a team reads its result (Phase 9, ADR 020).
 */

export interface GradingCounts {
  graded: number;
  ungraded: number;
  /** Teams that submitted nothing for the milestone. */
  noSubmission: number;
}

export function gradingCounts(grading: Pick<Grading, "rows">): GradingCounts {
  const graded = grading.rows.filter((row) => row.evaluation).length;
  return {
    graded,
    ungraded: grading.rows.length - graded,
    noSubmission: grading.rows.filter((row) => !row.latestWork).length,
  };
}

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** The release confirmation: who is graded, who is not, and that it is for good. */
export function releaseConfirmText(grading: Grading): string {
  const { graded, ungraded } = gradingCounts(grading);
  const label = `M${grading.milestone.position} · ${grading.milestone.name}`;
  const what = grading.marksEnabled ? "marks and feedback" : "feedback";
  return [
    `Release the ${grading.marksEnabled ? "results" : "feedback"} of ${label} to every team now?`,
    `${plural(graded, "team is", "teams are")} graded${ungraded ? `; ${plural(ungraded, "team is", "teams are")} not graded yet and will see their result once you grade them` : ""}.`,
    `Release can't be undone. You can still correct ${what} afterwards; the team sees it as updated.`,
  ].join("\n\n");
}

/** "14 / 20", "14", or null when only feedback was given or marks are off. */
export function marksText(evaluation: Pick<TeamEvaluation, "marks" | "maxMarks">): string | null {
  if (evaluation.marks === null || evaluation.marks === undefined) return null;
  const marks = Number.isInteger(evaluation.marks) ? String(evaluation.marks) : evaluation.marks.toFixed(2).replace(/0$/, "");
  return evaluation.maxMarks == null ? marks : `${marks} / ${evaluation.maxMarks}`;
}

/** "Released on <date>" ("Feedback released on" without marks), plus "Updated on <date>" after a correction. */
export function evaluationDates(evaluation: TeamEvaluation): string[] {
  const released = "marks" in evaluation ? "Released on" : "Feedback released on";
  const lines = evaluation.releasedAt ? [`${released} ${formatDate(evaluation.releasedAt)}`] : [];
  if (evaluation.updatedAfterRelease) lines.push(`Updated on ${formatDate(evaluation.updatedAt)}`);
  return lines;
}

/** Parses a marks field: empty means none; otherwise a number with at most 2 decimals. */
export function parseMarks(raw: string): { marks: number | null; problem: string | null } {
  const value = raw.trim();
  if (value === "") return { marks: null, problem: null };
  const marks = Number(value);
  if (!Number.isFinite(marks) || marks < 0 || !/^\d+(\.\d{1,2})?$/.test(value)) {
    return { marks: null, problem: "Use a number like 14 or 14.5" };
  }
  return { marks, problem: null };
}
