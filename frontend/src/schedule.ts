import { formatDate, isoDate, localDateInput } from "./dates";
import type { CycleInput } from "./types";

/** The cycle's dates, in the order they happen. */
export type ScheduleField =
  | "teamFormationDeadline"
  | "teamCompletionDeadline"
  | "ideaDeadline"
  | "submissionStartAt"
  | "submissionDeadline";

export type Schedule = Pick<CycleInput, ScheduleField>;

const DAY_MS = 24 * 60 * 60 * 1000;

/** A local date input `days` from today at the given time. */
function daysFromToday(days: number, hours: number, minutes: number) {
  const date = new Date(Date.now() + days * DAY_MS);
  date.setHours(hours, minutes, 0, 0);
  return localDateInput(date.toISOString());
}

/**
 * A schedule that is valid as it is: teams in a week, ideas a week later,
 * submissions open the next morning and close a month after that. Faculty
 * adjust it rather than build it from scratch.
 */
export function defaultSchedule(): Schedule {
  const formation = daysFromToday(7, 23, 59);
  return {
    teamFormationDeadline: formation,
    teamCompletionDeadline: formation,
    ideaDeadline: daysFromToday(14, 23, 59),
    submissionStartAt: daysFromToday(15, 9, 0),
    submissionDeadline: daysFromToday(45, 23, 59),
  };
}

/** Two days after `value`: where the faculty's placing window ends when they switch it on. */
export function twoDaysAfter(value: string) {
  return localDateInput(new Date(Date.parse(value) + 2 * DAY_MS).toISOString());
}

/**
 * What is out of order, per date, in words a faculty member can act on. The
 * API checks the same order (D1 ≤ D2 ≤ D3 ≤ submissions open < deadline).
 */
export function scheduleProblems(
  schedule: Schedule,
  placing: boolean,
): Partial<Record<ScheduleField, string>> {
  const time = (field: ScheduleField) => Date.parse(schedule[field]);
  const problems: Partial<Record<ScheduleField, string>> = {};
  const fields: ScheduleField[] = [
    "teamFormationDeadline",
    ...(placing ? (["teamCompletionDeadline"] as const) : []),
    "ideaDeadline",
    "submissionStartAt",
    "submissionDeadline",
  ];
  const missing = fields.filter((field) => Number.isNaN(time(field)));
  if (missing.length > 0) {
    for (const field of missing) problems[field] = "Choose a date and time.";
    return problems;
  }
  const shown = (field: ScheduleField) => formatDate(isoDate(schedule[field]));
  if (placing && time("teamCompletionDeadline") <= time("teamFormationDeadline")) {
    problems.teamCompletionDeadline = `Must be after students stop forming teams (${shown("teamFormationDeadline")}).`;
  }
  const settled = placing ? "teamCompletionDeadline" : "teamFormationDeadline";
  if (time("ideaDeadline") < time(settled)) {
    problems.ideaDeadline = placing
      ? `Must be on or after the date you finish placing students (${shown(settled)}).`
      : `Must be on or after the date students stop forming teams (${shown(settled)}).`;
  }
  if (time("submissionStartAt") < time("ideaDeadline")) {
    problems.submissionStartAt = `Must be on or after the idea deadline (${shown("ideaDeadline")}).`;
  }
  if (time("submissionDeadline") <= time("submissionStartAt")) {
    problems.submissionDeadline = `Must be after submissions open (${shown("submissionStartAt")}).`;
  }
  return problems;
}

/** "3 days", "5 hours": the time between two local date inputs. */
function span(from: string, to: string) {
  const ms = Date.parse(to) - Date.parse(from);
  const days = Math.round(ms / DAY_MS);
  if (days >= 2) return `${days} days`;
  const hours = Math.round(ms / (60 * 60 * 1000));
  if (hours >= 2) return `${hours} hours`;
  return hours === 1 ? "1 hour" : "less than an hour";
}

/** The whole plan in one or two sentences, for a valid schedule. */
export function scheduleSummary(schedule: Schedule, placing: boolean) {
  const settled = placing
    ? schedule.teamCompletionDeadline
    : schedule.teamFormationDeadline;
  const teams = placing
    ? `Students form teams until ${formatDate(isoDate(schedule.teamFormationDeadline))}, then you have ${span(schedule.teamFormationDeadline, schedule.teamCompletionDeadline)} to place anyone left.`
    : `Students form teams until ${formatDate(isoDate(schedule.teamFormationDeadline))}.`;
  const ideas =
    Date.parse(schedule.ideaDeadline) > Date.parse(settled)
      ? `Ideas are due ${span(settled, schedule.ideaDeadline)} after teams are settled`
      : "Ideas are due when teams are settled";
  return `${teams} ${ideas}, and teams get ${span(schedule.submissionStartAt, schedule.submissionDeadline)} to submit their work.`;
}
