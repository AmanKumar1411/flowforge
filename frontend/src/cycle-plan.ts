import { formatDate, formatDay, formatFullDay } from "./dates";
import type { SemesterTerm } from "./semester";
import type { Cycle, CourseKind } from "./types";

/**
 * How faculty think about a cycle: it starts on a day, each phase lasts some
 * days, and work is due on a final day. `buildSchedule` turns that into the
 * five dates the API stores. Everything here is pure and uses the viewer's
 * time zone, so a phase that ends "on Tuesday" ends at 11:59 PM on their
 * Tuesday, across month, year and daylight-saving changes.
 */

/** Days per phase. */
export interface PhaseDurations {
  /** Students form their own teams, from the start date. */
  teams: number;
  /** The faculty place students without a team, after that (used only with a placing window). */
  placing: number;
  /** Teams pick or propose their first idea, after teams are settled. */
  ideas: number;
}

export interface ScheduleOptions {
  /** The final submission deadline's day, "YYYY-MM-DD"; work runs from the day after ideas are due. */
  finalDeadline: string;
  /** Whether the faculty keep time to place students without a team. */
  placingWindow: boolean;
}

/** The dates the API takes (ISO-8601, UTC). A null completion deadline means no faculty window. */
export interface BuiltSchedule {
  teamFormationDeadline: string;
  teamCompletionDeadline: string | null;
  ideaDeadline: string;
  submissionStartAt: string;
  submissionDeadline: string;
}

export const DEFAULT_DURATIONS: PhaseDurations = {
  teams: 7,
  placing: 2,
  ideas: 7,
};
/** The default final deadline: this many days after the start. */
export const DEFAULT_CYCLE_DAYS = 45;

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A local "YYYY-MM-DD" day plus `days`, at a local time. `Date` rolls months, years and DST over. */
function atLocal(day: string, days: number, hours: number, minutes: number) {
  const [, year, month, date] = DAY_PATTERN.exec(day) ?? [];
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(date) + days,
    hours,
    minutes,
  );
}

/** A real calendar day: "2026-13-40" is not one, although `Date` would roll it over. */
export function isValidDay(day: string) {
  const match = DAY_PATTERN.exec(day);
  if (!match) return false;
  const date = atLocal(day, 0, 12, 0);
  return (
    date.getFullYear() === Number(match[1]) &&
    date.getMonth() === Number(match[2]) - 1 &&
    date.getDate() === Number(match[3])
  );
}

/** The local "YYYY-MM-DD" of an ISO date (or of now). */
export function localDay(value?: string | Date) {
  const date = value === undefined ? new Date() : new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(day: string, days: number) {
  return localDay(atLocal(day, days, 12, 0));
}

/** Whole calendar days from one local day to another. */
export function daysBetween(from: string, to: string) {
  // Noon on both days keeps a daylight-saving hour from tipping the rounding.
  return Math.round(
    (atLocal(to, 0, 12, 0).getTime() - atLocal(from, 0, 12, 0).getTime()) /
      86_400_000,
  );
}

/**
 * Phases end at 11:59 PM on their last day; submissions open at the start of
 * the next day and close at 11:59 PM on the final day.
 */
export function buildSchedule(
  start: string,
  durations: PhaseDurations,
  options: ScheduleOptions,
): BuiltSchedule {
  const placing = options.placingWindow ? durations.placing : 0;
  const teamsEnd = durations.teams;
  const settledEnd = teamsEnd + placing;
  const ideasEnd = settledEnd + durations.ideas;
  return {
    teamFormationDeadline: atLocal(start, teamsEnd, 23, 59).toISOString(),
    teamCompletionDeadline: options.placingWindow
      ? atLocal(start, settledEnd, 23, 59).toISOString()
      : null,
    ideaDeadline: atLocal(start, ideasEnd, 23, 59).toISOString(),
    submissionStartAt: atLocal(start, ideasEnd + 1, 0, 0).toISOString(),
    submissionDeadline: atLocal(options.finalDeadline, 0, 23, 59).toISOString(),
  };
}

/** What the faculty enter on the timeline step. */
export interface TimelineInput {
  start: string;
  durations: PhaseDurations;
  finalDeadline: string;
  placingWindow: boolean;
}

export type TimelineField = "start" | "teams" | "placing" | "ideas" | "finalDeadline";

/** What is wrong with a timeline, per input, in words a faculty member can act on. */
export function timelineProblems(
  input: TimelineInput,
  now: Date = new Date(),
): Partial<Record<TimelineField, string>> {
  const problems: Partial<Record<TimelineField, string>> = {};
  if (!isValidDay(input.start)) problems.start = "Choose a start date.";
  if (!isValidDay(input.finalDeadline)) {
    problems.finalDeadline = "Choose the final deadline.";
  }
  const days = (value: number) => Number.isInteger(value) && value >= 1;
  if (!days(input.durations.teams)) {
    problems.teams = "Give students at least 1 whole day to form teams.";
  }
  if (input.placingWindow && !days(input.durations.placing)) {
    problems.placing =
      "Give yourself at least 1 whole day, or switch the extra time off.";
  }
  if (!days(input.durations.ideas)) {
    problems.ideas = "Give teams at least 1 whole day for their idea.";
  }
  if (Object.keys(problems).length > 0) return problems;

  const schedule = buildSchedule(input.start, input.durations, {
    finalDeadline: input.finalDeadline,
    placingWindow: input.placingWindow,
  });
  const opens = Date.parse(schedule.submissionStartAt);
  const deadline = Date.parse(schedule.submissionDeadline);
  if (deadline <= opens) {
    problems.finalDeadline = `The final deadline is before submissions open (${formatDate(schedule.submissionStartAt)}). Move it later or shorten the phases.`;
  } else if (deadline - opens < 86_400_000) {
    problems.finalDeadline = `That leaves teams less than a day for their work after ${formatDate(schedule.submissionStartAt)}.`;
  }
  if (Date.parse(schedule.teamFormationDeadline) <= now.getTime()) {
    problems.teams = `The students' team deadline (${formatDate(schedule.teamFormationDeadline)}) is already past. Start later or allow more days.`;
  }
  return problems;
}

/** A cycle's plan: start today, phases as long as in `cycle`, measured from when it started there. */
export function timelineFromCycle(
  cycle: Pick<
    Cycle,
    | "teamFormationDeadline"
    | "teamCompletionDeadline"
    | "ideaDeadline"
    | "submissionDeadline"
    | "publishedAt"
    | "createdAt"
  >,
  start: string,
  measuredFrom: string = localDay(cycle.publishedAt ?? cycle.createdAt),
): TimelineInput {
  const formation = localDay(cycle.teamFormationDeadline);
  const placingWindow =
    Date.parse(cycle.teamCompletionDeadline) >
    Date.parse(cycle.teamFormationDeadline);
  const settled = placingWindow
    ? localDay(cycle.teamCompletionDeadline)
    : formation;
  return {
    start,
    durations: {
      teams: Math.max(1, daysBetween(measuredFrom, formation)),
      placing: placingWindow
        ? Math.max(1, daysBetween(formation, settled))
        : DEFAULT_DURATIONS.placing,
      ideas: Math.max(1, daysBetween(settled, localDay(cycle.ideaDeadline))),
    },
    finalDeadline: addDays(
      start,
      daysBetween(measuredFrom, localDay(cycle.submissionDeadline)),
    ),
    placingWindow,
  };
}

/**
 * A plan moved into a semester's term: it starts today, or on the term's
 * first day while the term is still ahead, and keeps its length; a final
 * deadline past the term comes back to the term's last day when the phases
 * still fit. A term that is over leaves the plan starting today, and the
 * wizard warns about it.
 */
export function timelineInTerm(
  timeline: TimelineInput,
  term: SemesterTerm,
  today: string,
): TimelineInput {
  const start = today < term.firstDay ? term.firstDay : today;
  let finalDeadline = addDays(start, daysBetween(timeline.start, timeline.finalDeadline));
  const { teams, placing, ideas } = timeline.durations;
  // Submissions open the day after ideas are due, and teams need more than a day after that.
  const earliest = addDays(start, teams + (timeline.placingWindow ? placing : 0) + ideas + 2);
  if (start <= term.lastDay && finalDeadline > term.lastDay && earliest <= term.lastDay) {
    finalDeadline = term.lastDay;
  }
  return { ...timeline, start, finalDeadline };
}

/**
 * Where a plan falls outside its semester's term, in words. Only a warning:
 * a cycle can run past its term. `start` is the local day the plan starts,
 * or null when it is fixed already (a published cycle).
 */
export function termWarnings(
  term: SemesterTerm,
  plan: { start: string | null; submissionDeadline: string },
): string[] {
  const semester = `semester ${term.semester} (${term.label})`;
  const day = (value: string) => formatFullDay(`${value}T12:00`);
  if (plan.start && plan.start > term.lastDay) {
    return [`It starts on ${day(plan.start)}, after ${semester} has ended.`];
  }
  const warnings: string[] = [];
  if (plan.start && plan.start < term.firstDay) {
    warnings.push(`It starts on ${day(plan.start)}, before ${semester} begins.`);
  }
  const final = localDay(plan.submissionDeadline);
  if (final > term.lastDay) {
    warnings.push(`The final deadline, ${day(final)}, is after ${semester} ends.`);
  } else if (final < term.firstDay) {
    warnings.push(`The final deadline, ${day(final)}, is before ${semester} begins.`);
  }
  return warnings;
}

/** A phrase with its key dates in bold. */
export type SummaryPart = { text: string; strong?: boolean };

/** The plan as plain sentences, for the live summary and the review step. */
export function planSummary(plan: {
  batchYear: number;
  kind: CourseKind;
  minTeamSize: number;
  maxTeamSize: number;
  schedule: BuiltSchedule;
}): SummaryPart[][] {
  const who =
    plan.kind === "ELECTIVE"
      ? "Students you enroll"
      : `Batch ${plan.batchYear} students`;
  const { minTeamSize: min, maxTeamSize: max, schedule } = plan;
  const size =
    max === 1
      ? "work alone"
      : min === 1
        ? `work alone or form teams of up to ${max}`
        : min === max
          ? `form teams of ${max}`
          : `form teams of ${min}–${max}`;
  const sentences: SummaryPart[][] = [
    [
      { text: `${who} ${size} until ` },
      { text: formatDay(schedule.teamFormationDeadline), strong: true },
      { text: "." },
    ],
  ];
  if (schedule.teamCompletionDeadline) {
    sentences.push([
      { text: "You then have until " },
      { text: formatDay(schedule.teamCompletionDeadline), strong: true },
      { text: " to place anyone without a team." },
    ]);
  }
  sentences.push(
    [
      { text: "Teams pick or propose an idea by " },
      { text: formatDay(schedule.ideaDeadline), strong: true },
      { text: "." },
    ],
    [
      { text: "They submit work between " },
      { text: formatDay(schedule.submissionStartAt), strong: true },
      { text: " and " },
      { text: formatDay(schedule.submissionDeadline), strong: true },
      { text: "." },
    ],
  );
  return sentences;
}

export function summaryText(sentences: SummaryPart[][]) {
  return sentences
    .map((parts) => parts.map((part) => part.text).join(""))
    .join(" ");
}
