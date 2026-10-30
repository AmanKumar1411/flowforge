import { semesterTerm } from "./semester";
import type { CourseKind, Cycle, Milestone } from "./types";

/**
 * What the faculty's cycle page says about a cycle, free of React: which
 * phase it is in, which parts it shows, the one thing to do next, what needs
 * attention, and short summaries. Counts come from the API calls the page
 * makes; a count that is still loading (or failed) is undefined. Deadlines
 * are stated once, in the phase bar, so nothing here repeats a date.
 */

export type CyclePhase = "draft" | "teams" | "ideas" | "milestones" | "ended" | "closed";

export type SectionKey = "students" | "catalog" | "teams" | "ideas" | "submissions";

/** The tabs of the faculty's cycle page. */
export const TABS = [
  { key: "overview", label: "Overview" },
  { key: "students", label: "Students" },
  { key: "teams", label: "Teams" },
  { key: "ideas", label: "Ideas" },
  { key: "milestones", label: "Milestones" },
] as const;
export type TabKey = (typeof TABS)[number]["key"];

/** The parts of the faculty's cycle page that depend on the course type. */
export type PagePart = "teamCompletion";

/** Which parts each course type shows; the page asks this map, never the course type itself. */
export const PAGE_PARTS: Record<CourseKind, readonly PagePart[]> = {
  // Enrolled students form their own teams; their teams' pages take anyone left over.
  ELECTIVE: [],
  // The whole batch: the faculty also place students left without a team, all on one panel.
  CORE: ["teamCompletion"],
};

export function shows(kind: CourseKind, part: PagePart) {
  return PAGE_PARTS[kind].includes(part);
}

/** Whether teams can pick from a faculty list, so the page shows it. */
export function showsIdeaList(cycle: Pick<Cycle, "ideaSource">) {
  return cycle.ideaSource !== "STUDENT_PROPOSALS";
}

export interface OpenMilestone {
  milestone: Milestone;
  /** Teams with at least one version for it. */
  submitted: number;
  teams: number;
}

export interface CycleCounts {
  /** Students taking part (the batch, or an elective's list), and how many have not signed in. */
  roster?: { total: number; notSignedIn: number };
  catalog?: { offered: number; picked: number };
  teams?: number;
  /** Students without a team, from the team-completion list. */
  unplaced?: number;
  ideas?: { waiting: number; approved: number; rejected: number; none: number };
  /** Due milestones: how many teams are graded, and whether the results are released. */
  gradingQueue?: {
    milestone: { id: string; position: number; name: string };
    graded: number;
    ungraded: number;
    released: boolean;
  }[];
  /** Milestones taking submissions now. */
  openMilestones?: OpenMilestone[];
  /** Parts whose counts could not be loaded. */
  failed?: Partial<Record<SectionKey, true>>;
}

/** The API's computed stage, as the page's phases. */
export function phaseOf(cycle: Pick<Cycle, "currentStage">): CyclePhase {
  switch (cycle.currentStage.kind) {
    case "DRAFT":
      return "draft";
    case "TEAMS":
      return "teams";
    case "IDEAS":
      return "ideas";
    case "MILESTONE":
      return "milestones";
    case "WRAP_UP":
      return "ended";
    case "CLOSED":
      return "closed";
  }
}

/**
 * Where an action takes the faculty: a tab, the wizard's review step to
 * publish, the teams with proposals waiting (or that one team's page), or
 * the students without a team.
 */
export type PageTarget = TabKey | "review" | "completion" | "publish";

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

const milestoneLabel = (milestone: Pick<Milestone, "position" | "name">) =>
  `M${milestone.position} · ${milestone.name}`;

/** "Elective · open to enrolled students · Teams of 2–4 · Semester 7 (Aug–Dec 2026)" */
export function cycleFacts(cycle: Cycle) {
  const who =
    cycle.kind === "ELECTIVE"
      ? "Elective · open to enrolled students"
      : `Core · open to all of batch ${cycle.batchYear}`;
  const { minTeamSize: min, maxTeamSize: max } = cycle;
  const size = max === 1 ? "Solo projects" : min === max ? `Teams of ${max}` : `Teams of ${min}–${max}`;
  const term = semesterTerm(cycle.batchYear, cycle.semester);
  return `${who} · ${size} · Semester ${cycle.semester} (${term.label})`;
}

/** Whether the students with no team are worth showing: a core course with students, once published. */
export function showsCompletion(cycle: Cycle, phase: CyclePhase, counts: CycleCounts) {
  return shows(cycle.kind, "teamCompletion") && phase !== "draft" && (counts.roster?.total ?? 0) > 0;
}

/** What the teams list says when there is no team: one line, and the next step if the faculty have one. */
export function teamsEmpty(
  cycle: Cycle,
  phase: CyclePhase,
  counts: CycleCounts,
): { text: string; action?: { label: string; target: PageTarget } } {
  if (phase === "draft") return { text: "No teams yet. Students form teams once you publish the project." };
  if (phase === "closed") return { text: "No teams were formed." };
  if (counts.roster?.total === 0) {
    return cycle.kind === "ELECTIVE"
      ? {
          text: "No teams yet. Enroll students so they can form teams.",
          action: { label: "Enroll students", target: "students" },
        }
      : {
          text: `No teams yet. Add the students of batch ${cycle.batchYear} so they can form teams.`,
          action: { label: "Add students", target: "students" },
        };
  }
  if (phase === "teams") return { text: "No teams yet. Students are forming their own teams now." };
  if (phase === "ideas" && showsCompletion(cycle, phase, counts)) {
    return {
      text: "No team was formed. Build teams from the students without one.",
      action: { label: "Place students", target: "completion" },
    };
  }
  return { text: "No team was formed." };
}

export type PageAction =
  | { kind: "close"; label: string }
  | { kind: "go"; label: string; target: PageTarget };

/** The single most useful thing to do now; a closed cycle has none. */
export function primaryAction(cycle: Cycle, phase: CyclePhase, counts: CycleCounts): PageAction | null {
  if (phase === "draft") return { kind: "go", label: "Review and publish", target: "publish" };
  if (phase === "closed") return null;
  if (counts.roster?.total === 0) {
    return {
      kind: "go",
      label: cycle.kind === "ELECTIVE" ? "Enroll students" : "Add students",
      target: "students",
    };
  }
  if (phase === "ideas" && counts.unplaced) {
    return { kind: "go", label: `Place ${plural(counts.unplaced, "student")}`, target: "completion" };
  }
  if (counts.ideas?.waiting) {
    return { kind: "go", label: `Review ${plural(counts.ideas.waiting, "proposal")}`, target: "review" };
  }
  if (phase === "ended") return { kind: "close", label: "Close the project" };
  const open = counts.openMilestones?.[0];
  if (open) return { kind: "go", label: `See ${milestoneLabel(open.milestone)} work`, target: "milestones" };
  if (phase === "ideas") return { kind: "go", label: "See the ideas", target: "ideas" };
  if (phase === "milestones") return { kind: "go", label: "See the milestones", target: "milestones" };
  return { kind: "go", label: "See the teams", target: "teams" };
}

export interface AttentionItem {
  key: string;
  text: string;
  action: string;
  target: PageTarget;
}

/** Only things the faculty can act on now; empty when there is nothing, and for a closed cycle. */
export function attentionItems(cycle: Cycle, phase: CyclePhase, counts: CycleCounts): AttentionItem[] {
  if (phase === "closed") return [];
  const items: AttentionItem[] = [];
  if (counts.roster?.total === 0) {
    items.push(
      cycle.kind === "ELECTIVE"
        ? { key: "students", text: "No students are enrolled yet", action: "Enroll students", target: "students" }
        : {
            key: "students",
            text: `No student of batch ${cycle.batchYear} has signed in or been added yet`,
            action: "Add students",
            target: "students",
          },
    );
  }
  // A1: the faculty place students left without a team until the idea deadline.
  if (phase === "ideas" && counts.unplaced) {
    items.push({
      key: "place",
      text: `${plural(counts.unplaced, "student has", "students have")} no team`,
      action: "Place them",
      target: "completion",
    });
  }
  if (counts.ideas?.waiting) {
    items.push({
      key: "review",
      text: `${plural(counts.ideas.waiting, "proposal is", "proposals are")} waiting for your review`,
      action: "Review",
      target: "review",
    });
  }
  for (const due of counts.gradingQueue ?? []) {
    if (phase === "draft") break;
    if (due.ungraded > 0) {
      items.push({
        key: `grade-${due.milestone.id}`,
        text: `${milestoneLabel(due.milestone)} due: ${plural(due.ungraded, "team")} to grade`,
        action: "Grade",
        target: "milestones",
      });
    }
    if (due.graded > 0 && !due.released) {
      items.push({
        key: `release-${due.milestone.id}`,
        text: `${milestoneLabel(due.milestone)} graded, not released`,
        action: "Release",
        target: "milestones",
      });
    }
  }
  for (const open of counts.openMilestones ?? []) {
    const missing = open.teams - open.submitted;
    if (missing > 0) {
      items.push({
        key: `work-${open.milestone.id}`,
        text: `${plural(missing, "team has", "teams have")} not submitted ${milestoneLabel(open.milestone)} yet`,
        action: "See the work",
        target: "milestones",
      });
    }
  }
  return items;
}

/** The idea list's one line, in past tense once the cycle is closed. */
export function catalogSummary(phase: CyclePhase, counts: CycleCounts): string {
  const closed = phase === "closed";
  if (counts.failed?.catalog) return "Couldn't load this summary; open it for details";
  const catalog = counts.catalog;
  if (!catalog) return "Loading…";
  if (catalog.offered === 0) return closed ? "No ideas were listed" : "No ideas listed yet";
  const offered = closed
    ? `${plural(catalog.offered, "idea was", "ideas were")} offered`
    : `${plural(catalog.offered, "idea")} offered`;
  if (catalog.picked > 0) return `${offered} · picked by ${plural(catalog.picked, "team")}`;
  return `${offered} · ${closed ? "none was picked" : "not picked yet"}`;
}

/** "M1 · Design review: 12 of 15 teams submitted", or why there is nothing to count. */
export function submissionSummary(phase: CyclePhase, counts: CycleCounts): string {
  if (counts.failed?.submissions || counts.failed?.teams) return "Couldn't load the submissions";
  if (counts.teams === undefined) return "Loading…";
  if (counts.teams === 0) return phase === "closed" ? "No work was submitted" : "No teams yet";
  const open = counts.openMilestones;
  if (!open) return "Loading…";
  if (open.length === 0) return "No milestone is open now";
  return open
    .map((entry) => `${milestoneLabel(entry.milestone)}: ${entry.submitted} of ${plural(entry.teams, "team")} submitted`)
    .join(" · ");
}
