import { DEFAULT_DAYS, defaultPlan, minuteAfter, shiftInput, termWarnings } from "./cycle-plan";
import { formatDate, isoDate, localDateInput } from "./dates";
import { LINK_LABELS } from "./links";
import { currentSemester, semesterTerm, SEMESTERS, type SemesterTerm } from "./semester";
import type {
  CourseKind,
  Cycle,
  CycleIdeaSource,
  CyclePayload,
  LinkType,
  MilestonePayload,
} from "./types";

/**
 * The cycle wizard's state and rules, free of React. The faculty set up a
 * project in one guided flow; the draft is saved after the first step and
 * updated on every step after it. These checks mirror the API's
 * (CycleWorkflow, MilestoneSchedule) only to spare a round trip and to flag
 * problems as the faculty type; the API stays the authority.
 */

export const STEPS = [
  { key: "details", label: "Details" },
  { key: "teams", label: "Teams & ideas" },
  { key: "milestones", label: "Milestones" },
  { key: "ideas", label: "Idea list" },
  { key: "students", label: "Students" },
  { key: "review", label: "Review & publish" },
] as const;
export type StepKey = (typeof STEPS)[number]["key"];

/** A new cycle (nothing saved yet), a draft, or a published cycle (most of it locked). */
export type WizardMode = "create" | "draft" | "published";

export const MAX_MILESTONES = 10;

/** A milestone row in the wizard; `key` tells rows apart before they have an id. */
export interface MilestoneDraft {
  key: string;
  id?: string;
  name: string;
  description: string;
  opensAt: string;
  dueAt: string;
  evaluationAt: string;
  required: LinkType[];
  optional: LinkType[];
}

export interface WizardState {
  courseName: string;
  title: string;
  description: string;
  kind: CourseKind;
  batchYear: number;
  semester: number;
  academicYear: string;
  /** The academic year follows the term until the faculty type their own. */
  academicYearTouched: boolean;
  minTeamSize: number;
  maxTeamSize: number;
  teamDeadline: string;
  ideaDeadline: string;
  ideaSource: CycleIdeaSource;
  ideaRequired: LinkType[];
  ideaOptional: LinkType[];
  milestones: MilestoneDraft[];
  /** A new plan follows the semester's term until the faculty change a date. */
  planAuto: boolean;
}

export type Problems = Partial<Record<string, string>>;

/** The steps this plan shows: the idea list only when teams can pick from it. */
export function visibleSteps(state: Pick<WizardState, "ideaSource">): StepKey[] {
  return STEPS.map((step) => step.key).filter(
    (key) => key !== "ideas" || state.ideaSource !== "STUDENT_PROPOSALS",
  );
}

/** Which step fixes a problem the API reports at publish. */
export const STEP_OF_CODE: Record<string, StepKey> = {
  INVALID_TEAM_SIZE: "details",
  INVALID_TEAM_DEADLINE: "teams",
  INVALID_IDEA_DEADLINE: "teams",
  NO_MILESTONES: "milestones",
  INVALID_MILESTONE: "milestones",
  INVALID_MILESTONE_COUNT: "milestones",
  INVALID_MILESTONE_SCHEDULE: "milestones",
  DUPLICATE_MILESTONE_NAME: "milestones",
  IDEA_LIST_EMPTY: "ideas",
  ROSTER_EMPTY: "students",
  NO_STUDENTS_YET: "students",
};

let nextKey = 0;
const rowKey = () => `milestone-${(nextKey += 1)}`;

/** A new milestone right after the last one (or after the idea deadline), with GitHub required. */
export function newMilestone(state: Pick<WizardState, "milestones" | "ideaDeadline">): MilestoneDraft {
  const previous = state.milestones.at(-1);
  const opensAt = previous ? previous.dueAt : minuteAfter(state.ideaDeadline);
  const dueAt = shiftInput(opensAt, DEFAULT_DAYS.milestone);
  return {
    key: rowKey(),
    name: previous ? `Milestone ${state.milestones.length + 1}` : "Final submission",
    description: "",
    opensAt,
    dueAt,
    evaluationAt: shiftInput(dueAt, DEFAULT_DAYS.evaluation),
    required: ["GITHUB"],
    optional: ["DEMO", "REPORT"],
  };
}

/** The term of the batch and semester entered, once both are usable. */
export function termOf(state: Pick<WizardState, "batchYear" | "semester">): SemesterTerm | null {
  if (!Number.isInteger(state.batchYear) || !Number.isInteger(state.semester) || state.semester < 1) {
    return null;
  }
  return semesterTerm(state.batchYear, state.semester);
}

/** After the batch or semester changes: the academic year and an untouched plan follow the new term. */
export function followTerm(state: WizardState, today = new Date()): WizardState {
  const term = termOf(state);
  if (!term) return state;
  const next = state.academicYearTouched ? state : { ...state, academicYear: term.academicYear };
  if (!state.planAuto) return next;
  const plan = defaultPlan(term, today);
  const shift = (draft: MilestoneDraft, index: number): MilestoneDraft =>
    index === 0
      ? { ...draft, ...plan.milestone }
      : draft;
  return {
    ...next,
    teamDeadline: plan.teamDeadline,
    ideaDeadline: plan.ideaDeadline,
    milestones: next.milestones.slice(0, 1).map(shift),
  };
}

/** A blank project: the batch of the faculty's latest one (or this year), the semester it is in today, teams of 2 to 4. */
export function blankState(previous: Cycle[], today = new Date()): WizardState {
  const latest = [...previous].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const batchYear = latest?.batchYear ?? today.getFullYear();
  const semester = currentSemester(batchYear, today);
  const plan = defaultPlan(semesterTerm(batchYear, semester), today);
  return followTerm(
    {
      courseName: "",
      title: "",
      description: "",
      kind: "CORE",
      batchYear,
      semester,
      academicYear: "",
      academicYearTouched: false,
      minTeamSize: 2,
      maxTeamSize: 4,
      teamDeadline: plan.teamDeadline,
      ideaDeadline: plan.ideaDeadline,
      ideaSource: "BOTH",
      ideaRequired: [],
      ideaOptional: ["GITHUB", "DRIVE"],
      milestones: [{ ...newMilestone({ milestones: [], ideaDeadline: plan.ideaDeadline }), ...plan.milestone }],
      planAuto: true,
    },
    today,
  );
}

/**
 * A previous project as a template: its settings, idea rules and milestones,
 * with every date moved by the same amount so the plan keeps its shape and
 * starts like a new one (today, or when the semester starts).
 */
export function stateFromTemplate(cycle: Cycle, today = new Date()): WizardState {
  const copy = stateFromCycle(cycle);
  const semester = currentSemester(cycle.batchYear, today);
  const term = semesterTerm(cycle.batchYear, semester);
  const shift = Date.parse(defaultPlan(term, today).teamDeadline) - Date.parse(copy.teamDeadline);
  const move = (value: string) => localDateInput(new Date(Date.parse(value) + shift).toISOString());
  return {
    ...copy,
    semester,
    academicYear: term.academicYear,
    academicYearTouched: false,
    teamDeadline: move(copy.teamDeadline),
    ideaDeadline: move(copy.ideaDeadline),
    milestones: copy.milestones.map((milestone) => ({
      ...milestone,
      id: undefined,
      key: rowKey(),
      opensAt: move(milestone.opensAt),
      dueAt: move(milestone.dueAt),
      evaluationAt: move(milestone.evaluationAt),
    })),
    planAuto: false,
  };
}

/** The cycle being edited, with its exact dates. */
export function stateFromCycle(cycle: Cycle): WizardState {
  return {
    courseName: cycle.courseName,
    title: cycle.title,
    description: cycle.description ?? "",
    kind: cycle.kind,
    batchYear: cycle.batchYear,
    semester: cycle.semester,
    academicYear: cycle.academicYear,
    academicYearTouched: true,
    minTeamSize: cycle.minTeamSize,
    maxTeamSize: cycle.maxTeamSize,
    teamDeadline: localDateInput(cycle.teamDeadline),
    ideaDeadline: localDateInput(cycle.ideaDeadline),
    ideaSource: cycle.ideaSource,
    ideaRequired: [...cycle.ideaLinkRequirement.required],
    ideaOptional: [...cycle.ideaLinkRequirement.optional],
    milestones: cycle.milestones.map((milestone) => ({
      key: milestone.id,
      id: milestone.id,
      name: milestone.name,
      description: milestone.description ?? "",
      opensAt: localDateInput(milestone.submissionOpensAt),
      dueAt: localDateInput(milestone.submissionDueAt),
      evaluationAt: localDateInput(milestone.evaluationAt),
      required: [...milestone.linkRequirement.required],
      optional: [...milestone.linkRequirement.optional],
    })),
    planAuto: false,
  };
}

const time = (value: string) => Date.parse(value);
const isTime = (value: string) => !Number.isNaN(time(value));

/**
 * A new idea deadline. In a plan that can still change, milestones that would
 * now open before it move later together, keeping their spacing, so the plan
 * stays in order without a trip to the milestones step.
 */
export function withIdeaDeadline(state: WizardState, ideaDeadline: string, mode: WizardMode): WizardState {
  const first = state.milestones[0];
  const next = { ...state, ideaDeadline, planAuto: false };
  if (mode === "published" || !first || !isTime(ideaDeadline) || !isTime(first.opensAt)) return next;
  const gap = time(ideaDeadline) - time(first.opensAt);
  if (gap <= 0) return next;
  const move = (value: string) =>
    isTime(value) ? localDateInput(new Date(time(value) + gap + 60_000).toISOString()) : value;
  return {
    ...next,
    milestones: state.milestones.map((milestone) => ({
      ...milestone,
      opensAt: move(milestone.opensAt),
      dueAt: move(milestone.dueAt),
      evaluationAt: move(milestone.evaluationAt),
    })),
  };
}

/** Whether a published cycle's stored milestone has opened, so it can no longer change (A3). */
export function milestoneLocked(cycle: Cycle | null, draft: MilestoneDraft, now: Date) {
  if (!cycle || cycle.status !== "PUBLISHED" || !draft.id) return false;
  const stored = cycle.milestones.find((milestone) => milestone.id === draft.id);
  return Boolean(stored && Date.parse(stored.submissionOpensAt) <= now.getTime());
}

/** Whether a published cycle's stage deadline can still move: its stage has not ended. */
export function deadlineOpen(cycle: Cycle | null, field: "teamDeadline" | "ideaDeadline", now: Date) {
  if (!cycle || cycle.status !== "PUBLISHED") return true;
  return Date.parse(cycle[field]) > now.getTime();
}

export function detailsProblems(state: WizardState, mode: WizardMode): Problems {
  const problems: Problems = {};
  if (state.description.length > 2000) {
    problems.description = "Keep the description under 2,000 characters.";
  }
  if (mode === "published") return problems;
  if (!state.courseName.trim()) {
    problems.courseName = "Enter the course name, for example “Software Design”.";
  }
  if (!state.title.trim()) {
    problems.title = "Give this project a title, for example “Mid-semester project”.";
  }
  if (!Number.isInteger(state.batchYear) || state.batchYear < 2000 || state.batchYear > 2100) {
    problems.batchYear = "Enter the batch as a four-digit year, for example 2023.";
  }
  if (!Number.isInteger(state.semester) || state.semester < 1 || state.semester > SEMESTERS) {
    problems.semester = `Choose a semester from 1 to ${SEMESTERS}.`;
  }
  const year = /^(\d{4})-(\d{2})$/.exec(state.academicYear);
  if (!year || Number(year[2]) !== (Number(year[1]) + 1) % 100) {
    problems.academicYear = "Write the academic year like 2026-27.";
  }
  const { minTeamSize: min, maxTeamSize: max } = state;
  if (!Number.isInteger(max) || max < 1 || max > 10) {
    problems.maxTeamSize = "Teams can have from 1 to 10 students.";
  }
  if (!Number.isInteger(min) || min < 1) {
    problems.minTeamSize = "Teams need at least 1 student.";
  } else if (min > max) {
    problems.minTeamSize = "The smallest team can't be bigger than the largest.";
  }
  return problems;
}

/** The team and idea deadlines; on a published cycle, a moved deadline must be in the future. */
export function teamsProblems(state: WizardState, mode: WizardMode, cycle: Cycle | null, now: Date): Problems {
  const problems: Problems = {};
  for (const field of ["teamDeadline", "ideaDeadline"] as const) {
    if (!isTime(state[field])) problems[field] = "Choose a date and time.";
    else if (
      mode === "published" &&
      cycle &&
      isoDate(state[field]) !== cycle[field] &&
      time(state[field]) <= now.getTime()
    ) {
      problems[field] = "Choose a time in the future.";
    }
  }
  if (!problems.teamDeadline && !problems.ideaDeadline && time(state.ideaDeadline) <= time(state.teamDeadline)) {
    problems.ideaDeadline = `Must be after the team deadline (${formatDate(isoDate(state.teamDeadline))}), so there is time to place students without a team.`;
  }
  const both = new Set([...state.ideaRequired, ...state.ideaOptional]);
  if (both.size !== state.ideaRequired.length + state.ideaOptional.length) {
    problems.ideaLinks = "A link can't be both required and optional.";
  }
  return problems;
}

/**
 * Every milestone row's problems, keyed `m<index>.<field>`, plus `milestones`
 * for the list as a whole. Shown live, so overlaps are flagged as dates change.
 */
export function milestoneProblems(
  state: WizardState,
  mode: WizardMode,
  cycle: Cycle | null,
  now: Date,
): Problems {
  const problems: Problems = {};
  if (state.milestones.length === 0) problems.milestones = "Add at least one milestone.";
  if (state.milestones.length > MAX_MILESTONES) {
    problems.milestones = `A project has at most ${MAX_MILESTONES} milestones.`;
  }
  const names = new Set<string>();
  state.milestones.forEach((milestone, index) => {
    const at = (field: string) => `m${index}.${field}`;
    const name = milestone.name.trim();
    if (!name) problems[at("name")] = "Give the milestone a name.";
    else if (name.length > 80) problems[at("name")] = "Keep the name under 80 characters.";
    else if (names.has(name.toLowerCase())) problems[at("name")] = "Another milestone has this name.";
    names.add(name.toLowerCase());
    if (milestone.description.length > 2000) {
      problems[at("description")] = "Keep the description under 2,000 characters.";
    }
    for (const field of ["opensAt", "dueAt", "evaluationAt"] as const) {
      if (!isTime(milestone[field])) problems[at(field)] = "Choose a date and time.";
    }
    if (problems[at("opensAt")] || problems[at("dueAt")] || problems[at("evaluationAt")]) return;
    const previous = state.milestones[index - 1];
    if (index === 0 && isTime(state.ideaDeadline) && time(milestone.opensAt) < time(state.ideaDeadline)) {
      problems[at("opensAt")] = `Opens before the idea deadline (${formatDate(isoDate(state.ideaDeadline))}).`;
    } else if (previous && isTime(previous.dueAt) && time(milestone.opensAt) < time(previous.dueAt)) {
      problems[at("opensAt")] = `Overlaps M${index}: opens before it is due (${formatDate(isoDate(previous.dueAt))}).`;
    }
    if (time(milestone.dueAt) <= time(milestone.opensAt)) {
      problems[at("dueAt")] = "Must be after submissions open.";
    }
    if (time(milestone.evaluationAt) < time(milestone.dueAt)) {
      problems[at("evaluationAt")] = "Can't be before submissions are due.";
    }
    if (
      mode === "published" &&
      !milestoneLocked(cycle, milestone, now) &&
      cycle &&
      isoDate(milestone.opensAt) !==
        cycle.milestones.find((stored) => stored.id === milestone.id)?.submissionOpensAt &&
      time(milestone.opensAt) <= now.getTime()
    ) {
      problems[at("opensAt")] = "Choose a time in the future.";
    }
    if (milestone.required.length + milestone.optional.length > new Set([...milestone.required, ...milestone.optional]).size) {
      problems[at("links")] = "A link can't be both required and optional.";
    }
  });
  return problems;
}

export function stepProblems(
  step: StepKey,
  state: WizardState,
  mode: WizardMode,
  cycle: Cycle | null,
  now: Date,
): Problems {
  if (step === "details") return detailsProblems(state, mode);
  if (step === "teams") return teamsProblems(state, mode, cycle, now);
  if (step === "milestones") return milestoneProblems(state, mode, cycle, now);
  return {};
}

/** Where the plan leaves its semester's term. */
export function planWarnings(state: WizardState): string[] {
  const term = termOf(state);
  if (!term) return [];
  const last = state.milestones.at(-1);
  return termWarnings(term, {
    teamDeadline: state.teamDeadline,
    lastDate: last ? last.evaluationAt : null,
  });
}

function milestonePayload(milestone: MilestoneDraft): MilestonePayload {
  return {
    ...(milestone.id ? { id: milestone.id } : {}),
    name: milestone.name.trim(),
    description: milestone.description.trim() || null,
    submissionOpensAt: isoDate(milestone.opensAt),
    submissionDueAt: isoDate(milestone.dueAt),
    evaluationAt: isoDate(milestone.evaluationAt),
    linkRequirement: { required: milestone.required, optional: milestone.optional },
  };
}

/** Everything the API takes for a new or draft cycle. */
export function payloadOf(state: WizardState): CyclePayload {
  return {
    courseName: state.courseName.trim(),
    title: state.title.trim(),
    description: state.description.trim(),
    kind: state.kind,
    batchYear: state.batchYear,
    semester: state.semester,
    academicYear: state.academicYear,
    minTeamSize: state.minTeamSize,
    maxTeamSize: state.maxTeamSize,
    teamDeadline: isoDate(state.teamDeadline),
    ideaDeadline: isoDate(state.ideaDeadline),
    ideaSource: state.ideaSource,
    ideaLinkRequirement: { required: state.ideaRequired, optional: state.ideaOptional },
    milestones: state.milestones.map(milestonePayload),
  };
}

/**
 * A draft sends everything (it is free to change). A published cycle refuses
 * a locked field even when unchanged, so it sends only the description, the
 * deadlines that moved, and its milestones when one of them changed.
 */
export function updatePayload(state: WizardState, cycle: Cycle, mode: WizardMode): Partial<CyclePayload> {
  if (mode !== "published") return payloadOf(state);
  const changed: Partial<CyclePayload> = {};
  if (state.description.trim() !== (cycle.description ?? "")) {
    changed.description = state.description.trim();
  }
  for (const field of ["teamDeadline", "ideaDeadline"] as const) {
    if (isoDate(state[field]) !== cycle[field]) changed[field] = isoDate(state[field]);
  }
  const milestones = state.milestones.map(milestonePayload);
  const before = cycle.milestones.map((milestone) =>
    JSON.stringify([milestone.description ?? null, milestone.submissionOpensAt, milestone.submissionDueAt, milestone.evaluationAt]),
  );
  if (
    milestones.some(
      (milestone, index) =>
        JSON.stringify([milestone.description, milestone.submissionOpensAt, milestone.submissionDueAt, milestone.evaluationAt]) !==
        before[index],
    )
  ) {
    changed.milestones = milestones;
  }
  return changed;
}

/** "GitHub repository required · Demo optional" for one row. */
export function linksSummary(required: LinkType[], optional: LinkType[]) {
  const names = (types: LinkType[]) => types.map((type) => LINK_LABELS[type]).join(", ");
  return (
    [required.length ? `${names(required)} required` : "", optional.length ? `${names(optional)} optional` : ""]
      .filter(Boolean)
      .join(" · ") || "No links"
  );
}
