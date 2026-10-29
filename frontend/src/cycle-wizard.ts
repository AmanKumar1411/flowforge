import {
  addDays,
  buildSchedule,
  DEFAULT_CYCLE_DAYS,
  DEFAULT_DURATIONS,
  localDay,
  termWarnings,
  timelineFromCycle,
  timelineInTerm,
  timelineProblems,
  type BuiltSchedule,
  type TimelineInput,
} from "./cycle-plan";
import { formatDate, isoDate, localDateInput } from "./dates";
import { currentSemester, semesterTerm, SEMESTERS, type SemesterTerm } from "./semester";
import type { CourseKind, Cycle, CyclePayload } from "./types";

/**
 * The cycle wizard's state and rules, free of React. The wizard collects the
 * faculty's plan in four steps; this module checks each step in plain words
 * and turns the plan into exactly the fields the API takes. The API stays
 * the authority: these checks only spare a round trip.
 */

export const STEPS = [
  { key: "basics", label: "Basics" },
  { key: "teams", label: "Teams" },
  { key: "timeline", label: "Timeline" },
  { key: "review", label: "Review" },
] as const;
export type StepKey = (typeof STEPS)[number]["key"];

/** A new cycle, a draft being edited, or a published cycle (most of it locked). */
export type WizardMode = "create" | "draft" | "published";

/** The deadlines of a published cycle, edited directly as `datetime-local` values. */
export interface PublishedDeadlines {
  teamFormationDeadline: string;
  teamCompletionDeadline: string;
  ideaDeadline: string;
  submissionStartAt: string;
  submissionDeadline: string;
}

export interface WizardState {
  courseName: string;
  title: string;
  description: string;
  kind: CourseKind;
  batchYear: number;
  semester: number;
  minTeamSize: number;
  maxTeamSize: number;
  timeline: TimelineInput;
  /** Only for a published cycle. */
  deadlines: PublishedDeadlines;
  /** A draft keeps its exact dates until the faculty touch the plan. */
  timelineTouched: boolean;
  /** A new plan follows the semester's term until the faculty change its dates. */
  timelineAuto: boolean;
}

export type Problems = Partial<Record<string, string>>;

/** What can no longer change once a cycle is published (CycleWorkflow's editable fields). */
export const LOCKED_AFTER_PUBLISH = [
  "the course name and project title",
  "the batch, semester and academic year",
  "whether it is a core course or an elective",
  "the team sizes, and whether you keep extra time to place students",
  "the date submissions open",
];

/** What stays editable after publishing. */
export const EDITABLE_AFTER_PUBLISH =
  "You can still edit the description and the final deadline, and move a phase's deadline while that phase is still running.";

function deadlinesOf(cycle: Cycle): PublishedDeadlines {
  return {
    teamFormationDeadline: localDateInput(cycle.teamFormationDeadline),
    teamCompletionDeadline: localDateInput(cycle.teamCompletionDeadline),
    ideaDeadline: localDateInput(cycle.ideaDeadline),
    submissionStartAt: localDateInput(cycle.submissionStartAt),
    submissionDeadline: localDateInput(cycle.submissionDeadline),
  };
}

function defaultTimeline(today: Date): TimelineInput {
  const start = localDay(today);
  return {
    start,
    durations: { ...DEFAULT_DURATIONS },
    finalDeadline: addDays(start, DEFAULT_CYCLE_DAYS),
    placingWindow: false,
  };
}

/** The term of the batch and semester entered, once both are usable. */
export function termOf(state: Pick<WizardState, "batchYear" | "semester">): SemesterTerm | null {
  if (!Number.isInteger(state.batchYear) || !Number.isInteger(state.semester) || state.semester < 1) {
    return null;
  }
  return semesterTerm(state.batchYear, state.semester);
}

/** After the batch or semester changes, a plan the faculty have not changed moves into the new term. */
export function followTerm(state: WizardState, today = new Date()): WizardState {
  const term = termOf(state);
  if (!state.timelineAuto || !term) return state;
  return { ...state, timeline: timelineInTerm(state.timeline, term, localDay(today)) };
}

/**
 * A blank cycle: the batch of the faculty's latest cycle (or this year), the
 * semester it is in today, teams of 2 to 4, and the default plan inside that
 * semester's term.
 */
export function blankState(previous: Cycle[], today = new Date()): WizardState {
  const latest = [...previous].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )[0];
  const batchYear = latest?.batchYear ?? today.getFullYear();
  return followTerm(
    {
      courseName: "",
      title: "",
      description: "",
      kind: "CORE",
      batchYear,
      semester: currentSemester(batchYear, today),
      minTeamSize: 2,
      maxTeamSize: 4,
      timeline: defaultTimeline(today),
      deadlines: emptyDeadlines(),
      timelineTouched: true,
      timelineAuto: true,
    },
    today,
  );
}

function emptyDeadlines(): PublishedDeadlines {
  return {
    teamFormationDeadline: "",
    teamCompletionDeadline: "",
    ideaDeadline: "",
    submissionStartAt: "",
    submissionDeadline: "",
  };
}

/** A previous cycle as a template: its settings, and its phases moved to start today (or when the term starts). */
export function stateFromTemplate(cycle: Cycle, today = new Date()): WizardState {
  return followTerm(
    {
      courseName: cycle.courseName,
      title: cycle.title,
      description: cycle.description ?? "",
      kind: cycle.kind,
      batchYear: cycle.batchYear,
      semester: currentSemester(cycle.batchYear, today),
      minTeamSize: cycle.minTeamSize,
      maxTeamSize: cycle.maxTeamSize,
      timeline: timelineFromCycle(cycle, localDay(today)),
      deadlines: emptyDeadlines(),
      timelineTouched: true,
      timelineAuto: true,
    },
    today,
  );
}

/** The cycle being edited. A draft's plan is measured from today; a published cycle keeps its exact dates. */
export function stateFromCycle(cycle: Cycle, today = new Date()): WizardState {
  return {
    courseName: cycle.courseName,
    title: cycle.title,
    description: cycle.description ?? "",
    kind: cycle.kind,
    batchYear: cycle.batchYear,
    semester: cycle.semester,
    minTeamSize: cycle.minTeamSize,
    maxTeamSize: cycle.maxTeamSize,
    timeline: timelineFromCycle(cycle, localDay(today), localDay(today)),
    deadlines: deadlinesOf(cycle),
    timelineTouched: false,
    timelineAuto: false,
  };
}

export function basicsProblems(state: WizardState): Problems {
  const problems: Problems = {};
  if (!state.courseName.trim()) {
    problems.courseName = "Enter the course name, for example “Software Design”.";
  }
  if (!state.title.trim()) {
    problems.title =
      "Give this project round a title, for example “Mid-semester project”.";
  }
  if (state.description.length > 2000) {
    problems.description = "Keep the description under 2,000 characters.";
  }
  if (!Number.isInteger(state.batchYear) || state.batchYear < 2000 || state.batchYear > 2100) {
    problems.batchYear = "Enter the batch as a four-digit year, for example 2023.";
  }
  if (!Number.isInteger(state.semester) || state.semester < 1 || state.semester > SEMESTERS) {
    problems.semester = `Choose a semester from 1 to ${SEMESTERS}.`;
  }
  return problems;
}

export function teamsProblems(state: WizardState): Problems {
  const problems: Problems = {};
  const { minTeamSize: min, maxTeamSize: max } = state;
  if (!Number.isInteger(max) || max < 1 || max > 10) {
    problems.maxTeamSize = "Teams can have from 1 to 10 students.";
  }
  if (!Number.isInteger(min) || min < 1) {
    problems.minTeamSize = "Teams need at least 1 student.";
  } else if (min > max) {
    problems.minTeamSize = "The smallest team can't be bigger than the largest.";
  }
  const placing = state.timeline.durations.placing;
  if (state.timeline.placingWindow && (!Number.isInteger(placing) || placing < 1)) {
    problems.placing = "Give yourself at least 1 whole day, or switch the extra time off.";
  }
  return problems;
}

/** Whether a published cycle's deadline can still move: its phase has not ended. */
export function deadlineIsOpen(cycle: Cycle, field: keyof PublishedDeadlines, now: Date) {
  if (field === "submissionStartAt") return false;
  if (field === "teamCompletionDeadline" && !hasPlacingWindow(cycle)) return false;
  return Date.parse(cycle[field]) > now.getTime();
}

export function hasPlacingWindow(cycle: Pick<Cycle, "teamCompletionDeadline" | "teamFormationDeadline">) {
  return Date.parse(cycle.teamCompletionDeadline) > Date.parse(cycle.teamFormationDeadline);
}

export function timelineStepProblems(
  state: WizardState,
  mode: WizardMode,
  cycle: Cycle | null,
  now: Date,
): Problems {
  if (mode !== "published" || !cycle) {
    if (mode === "draft" && !state.timelineTouched) return {};
    const problems: Problems = timelineProblems(state.timeline, now);
    // The extra-time days belong to the Teams step.
    delete problems.placing;
    return problems;
  }
  const problems: Problems = {};
  const d = state.deadlines;
  const time = (field: keyof PublishedDeadlines) => Date.parse(d[field]);
  const original = deadlinesOf(cycle);
  for (const field of Object.keys(d) as (keyof PublishedDeadlines)[]) {
    if (Number.isNaN(time(field))) problems[field] = "Choose a date and time.";
    else if (d[field] !== original[field] && time(field) <= now.getTime()) {
      problems[field] = "Choose a time in the future.";
    }
  }
  if (Object.keys(problems).length > 0) return problems;
  const shown = (field: keyof PublishedDeadlines) => formatDate(isoDate(d[field]));
  const window = hasPlacingWindow(cycle);
  if (time("teamFormationDeadline") > time("submissionStartAt")) {
    problems.teamFormationDeadline = `Must be by the time submissions open (${shown("submissionStartAt")}).`;
  }
  if (window && time("teamCompletionDeadline") <= time("teamFormationDeadline")) {
    problems.teamCompletionDeadline = `Must be after the students' team deadline (${shown("teamFormationDeadline")}).`;
  }
  const settled = window ? "teamCompletionDeadline" : "teamFormationDeadline";
  if (time("ideaDeadline") < time(settled)) {
    problems.ideaDeadline = `Must be on or after ${window ? "your placing deadline" : "the students' team deadline"} (${shown(settled)}).`;
  } else if (time("ideaDeadline") > time("submissionStartAt")) {
    problems.ideaDeadline = `Must be by the time submissions open (${shown("submissionStartAt")}).`;
  }
  if (time("submissionDeadline") <= time("submissionStartAt")) {
    problems.submissionDeadline = `Must be after submissions open (${shown("submissionStartAt")}).`;
  }
  return problems;
}

export function stepProblems(
  step: StepKey,
  state: WizardState,
  mode: WizardMode,
  cycle: Cycle | null,
  now: Date,
): Problems {
  if (step === "basics") return mode === "published" ? descriptionOnly(state) : basicsProblems(state);
  if (step === "teams") return mode === "published" ? {} : teamsProblems(state);
  if (step === "timeline") return timelineStepProblems(state, mode, cycle, now);
  return {};
}

function descriptionOnly(state: WizardState): Problems {
  const { description } = basicsProblems(state);
  return description ? { description } : {};
}

/** The dates the plan stands for, if it is complete: for the summary and the review. */
export function scheduleOf(
  state: WizardState,
  mode: WizardMode,
  cycle: Cycle | null,
  now: Date,
): BuiltSchedule | null {
  if (Object.keys(timelineStepProblems(state, mode, cycle, now)).length > 0) {
    return null;
  }
  if (mode === "published" || (mode === "draft" && !state.timelineTouched && cycle)) {
    const source =
      mode === "published"
        ? Object.fromEntries(
            Object.entries(state.deadlines).map(([field, value]) => [field, isoDate(value)]),
          )
        : cycle!;
    const formation = source.teamFormationDeadline as string;
    const completion = source.teamCompletionDeadline as string;
    return {
      teamFormationDeadline: formation,
      teamCompletionDeadline: Date.parse(completion) > Date.parse(formation) ? completion : null,
      ideaDeadline: source.ideaDeadline as string,
      submissionStartAt: source.submissionStartAt as string,
      submissionDeadline: source.submissionDeadline as string,
    };
  }
  if (Object.keys(teamsProblems(state)).length > 0) return null;
  return buildSchedule(state.timeline.start, state.timeline.durations, {
    finalDeadline: state.timeline.finalDeadline,
    placingWindow: state.timeline.placingWindow,
  });
}

/**
 * Where the plan leaves its semester's term. The start counts only while the
 * faculty plan it; a published cycle (or an untouched draft) keeps its own.
 */
export function planWarnings(
  state: WizardState,
  mode: WizardMode,
  schedule: BuiltSchedule | null,
): string[] {
  const term = termOf(state);
  if (!schedule || !term) return [];
  const planned = mode === "create" || (mode === "draft" && state.timelineTouched);
  return termWarnings(term, {
    start: planned ? state.timeline.start : null,
    submissionDeadline: schedule.submissionDeadline,
  });
}

function basicsAndTeams(state: WizardState) {
  return {
    courseName: state.courseName.trim(),
    title: state.title.trim(),
    description: state.description.trim(),
    kind: state.kind,
    batchYear: state.batchYear,
    semester: state.semester,
    // Display only in the wizard: the API stores it, the semester decides it.
    academicYear: termOf(state)?.academicYear ?? "",
    minTeamSize: state.minTeamSize,
    maxTeamSize: state.maxTeamSize,
  };
}

/** Everything a new cycle needs, with the dates built from the plan. */
export function createPayload(state: WizardState, now = new Date()): CyclePayload {
  const schedule = scheduleOf(state, "create", null, now);
  if (!schedule) throw new Error("The plan is incomplete");
  return { ...basicsAndTeams(state), ...schedule };
}

/**
 * Only what changed: a published cycle refuses any locked field in the
 * request, even unchanged. A draft sends its rebuilt dates once the plan was
 * touched; a published cycle sends the deadlines that moved.
 */
export function updatePayload(
  state: WizardState,
  cycle: Cycle,
  mode: WizardMode,
): Partial<CyclePayload> {
  const changed: Partial<CyclePayload> = {};
  const before: Record<string, unknown> = {
    courseName: cycle.courseName,
    title: cycle.title,
    description: cycle.description ?? "",
    kind: cycle.kind,
    batchYear: cycle.batchYear,
    semester: cycle.semester,
    academicYear: cycle.academicYear,
    minTeamSize: cycle.minTeamSize,
    maxTeamSize: cycle.maxTeamSize,
  };
  const after = basicsAndTeams(state);
  const fields =
    mode === "published" ? (["description"] as const) : (Object.keys(after) as (keyof typeof after)[]);
  for (const field of fields) {
    if (after[field] !== before[field]) Object.assign(changed, { [field]: after[field] });
  }
  if (mode === "draft" && state.timelineTouched) {
    Object.assign(changed, scheduleOf(state, mode, cycle, new Date()));
  }
  if (mode === "published") {
    const original = deadlinesOf(cycle);
    for (const field of Object.keys(state.deadlines) as (keyof PublishedDeadlines)[]) {
      if (state.deadlines[field] !== original[field]) {
        Object.assign(changed, { [field]: isoDate(state.deadlines[field]) });
      }
    }
  }
  return changed;
}
