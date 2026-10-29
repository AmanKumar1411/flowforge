import { formatFullDay } from "./dates";
import type { SemesterTerm } from "./semester";

/**
 * Days and default dates for the cycle wizard, free of React. Dates are
 * `datetime-local` values ("2026-11-04T23:59") in the viewer's time zone;
 * a deadline falls at the end of its day.
 */

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Teams for a week, then ideas for another, then a first milestone of two weeks, evaluated two days later. */
export const DEFAULT_DAYS = { teams: 7, ideas: 7, milestone: 14, evaluation: 2 } as const;

export function isValidDay(day: string) {
  const match = DAY_PATTERN.exec(day);
  if (!match) return false;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getDate() === Number(match[3]);
}

const pad = (part: number) => String(part).padStart(2, "0");

/** "YYYY-MM-DD" in the viewer's time zone. */
export function localDay(value: string | Date = new Date()) {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(day: string, days: number) {
  const [year, month, date] = day.split("-").map(Number);
  return localDay(new Date(year, month - 1, date + days));
}

/** The last minute of a day, as a `datetime-local` value. */
export function endOfDay(day: string) {
  return `${day}T23:59`;
}

/** A `datetime-local` value moved by whole days, keeping its time. */
export function shiftInput(value: string, days: number) {
  const [day, time] = value.split("T");
  return `${addDays(day, days)}T${time ?? "23:59"}`;
}

/** A `datetime-local` value one minute later (a window that opens when another closes). */
export function minuteAfter(value: string) {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() + 1);
  return `${localDay(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export interface DefaultPlan {
  teamDeadline: string;
  ideaDeadline: string;
  milestone: { opensAt: string; dueAt: string; evaluationAt: string };
}

/** A plan that starts today, or on the term's first day if that is later. */
export function defaultPlan(term: SemesterTerm | null, today: Date = new Date()): DefaultPlan {
  const todayDay = localDay(today);
  const start = term && term.firstDay > todayDay ? term.firstDay : todayDay;
  const teamDeadline = endOfDay(addDays(start, DEFAULT_DAYS.teams));
  const ideaDeadline = shiftInput(teamDeadline, DEFAULT_DAYS.ideas);
  const dueAt = shiftInput(ideaDeadline, DEFAULT_DAYS.milestone);
  return {
    teamDeadline,
    ideaDeadline,
    milestone: {
      opensAt: minuteAfter(ideaDeadline),
      dueAt,
      evaluationAt: shiftInput(dueAt, DEFAULT_DAYS.evaluation),
    },
  };
}

/** Where a plan leaves its semester's term; a warning, never a block. */
export function termWarnings(
  term: SemesterTerm,
  plan: { teamDeadline: string; lastDate: string | null },
): string[] {
  const warnings: string[] = [];
  const within = (value: string) => {
    const day = value.slice(0, 10);
    return day >= term.firstDay && day <= term.lastDay;
  };
  const termText = `semester ${term.semester} (${term.label})`;
  if (isValidDay(plan.teamDeadline.slice(0, 10)) && !within(plan.teamDeadline)) {
    warnings.push(
      `The team deadline, ${formatFullDay(plan.teamDeadline)}, is outside ${termText}.`,
    );
  }
  if (plan.lastDate && isValidDay(plan.lastDate.slice(0, 10)) && !within(plan.lastDate)) {
    warnings.push(
      `The last milestone ends ${formatFullDay(plan.lastDate)}, after ${termText} ends.`,
    );
  }
  return warnings;
}
