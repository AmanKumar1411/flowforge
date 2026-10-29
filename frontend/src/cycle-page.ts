import { semesterTerm } from "./semester";
import type { CourseKind, Cycle } from "./types";

/**
 * What the faculty's cycle page says about a cycle, free of React: which
 * phase it is in, which parts it shows, the one thing to do next, what needs
 * attention, and short summaries. Counts come from the API calls the page
 * makes; a count that is still loading (or failed) is undefined. Deadlines
 * are stated once, in the phase bar, so nothing here repeats a date.
 */

export type CyclePhase =
  | "draft"
  | "teams"
  | "placing"
  | "ideas"
  | "work"
  | "ended"
  | "closed";

export type SectionKey = "students" | "catalog" | "teams" | "ideas" | "submissions";

/** The parts of the faculty's cycle page below the header and the phases. */
export type PagePart =
  | "teamsList"
  | "submissionCount"
  | "studentsLink"
  | "ideaList"
  | "teamCompletion";

/** Which parts each course type shows; the page asks this map, never the course type itself. */
export const PAGE_PARTS: Record<CourseKind, readonly PagePart[]> = {
  // Enrolled students form their own teams and propose their own ideas.
  ELECTIVE: ["teamsList", "submissionCount", "studentsLink"],
  // The whole batch: the faculty also offer ideas and place students left without a team.
  CORE: ["teamsList", "submissionCount", "studentsLink", "ideaList", "teamCompletion"],
};

export function shows(kind: CourseKind, part: PagePart) {
  return PAGE_PARTS[kind].includes(part);
}

export interface CycleCounts {
  /** Students taking part (the batch, or an elective's list), and how many have not signed in. */
  roster?: { total: number; notSignedIn: number };
  catalog?: { offered: number; picked: number };
  teams?: number;
  /** Students without a team, from the team-completion list. */
  unplaced?: number;
  ideas?: { waiting: number; approved: number; rejected: number; none: number };
  submissions?: { submitted: number };
  /** Parts whose counts could not be loaded. */
  failed?: Partial<Record<SectionKey, true>>;
}

export function phaseOf(cycle: Cycle, now: number): CyclePhase {
  if (cycle.status === "DRAFT") return "draft";
  if (cycle.status === "CLOSED") return "closed";
  if (now < Date.parse(cycle.teamFormationDeadline)) return "teams";
  if (now < Date.parse(cycle.teamCompletionDeadline)) return "placing";
  if (now < Date.parse(cycle.submissionStartAt)) return "ideas";
  if (now < Date.parse(cycle.submissionDeadline)) return "work";
  return "ended";
}

/**
 * Where an action takes the faculty: the students page, the idea list, the
 * teams list, the teams list showing only proposals waiting for review (or
 * that one team's page), or the students without a team.
 */
export type PageTarget = "students" | "catalog" | "teams" | "review" | "completion";

/** The idea list starts open while the cycle is a draft, when there is time to fill it. */
export function sectionFor(phase: CyclePhase): SectionKey | null {
  return phase === "draft" ? "catalog" : null;
}

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/** "Elective · open to enrolled students · Teams of 2–4 · Semester 7 (Aug–Dec 2026)" */
export function cycleFacts(cycle: Cycle) {
  const who =
    cycle.kind === "ELECTIVE"
      ? "Elective · open to enrolled students"
      : `Core · open to all of batch ${cycle.batchYear}`;
  const { minTeamSize: min, maxTeamSize: max } = cycle;
  const size =
    max === 1 ? "Solo projects" : min === max ? `Teams of ${max}` : `Teams of ${min}–${max}`;
  const term = semesterTerm(cycle.batchYear, cycle.semester);
  return `${who} · ${size} · Semester ${cycle.semester} (${term.label})`;
}

/** Whether the students with no team are worth showing: a core course with students, once published. */
export function showsCompletion(cycle: Cycle, phase: CyclePhase, counts: CycleCounts) {
  return (
    shows(cycle.kind, "teamCompletion") &&
    phase !== "draft" &&
    (counts.roster?.total ?? 0) > 0
  );
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
  if (phase === "placing" && showsCompletion(cycle, phase, counts)) {
    return {
      text: "No team was formed. Build teams from the students without one.",
      action: { label: "Place students", target: "completion" },
    };
  }
  return { text: "No team was formed." };
}

export type PageAction =
  | { kind: "publish"; label: string }
  | { kind: "close"; label: string }
  | { kind: "go"; label: string; target: PageTarget };

/** The single most useful thing to do now; a closed cycle has none. */
export function primaryAction(
  cycle: Cycle,
  phase: CyclePhase,
  counts: CycleCounts,
): PageAction | null {
  if (phase === "draft") return { kind: "publish", label: "Publish to students" };
  if (phase === "closed") return null;
  if (counts.roster?.total === 0) {
    return {
      kind: "go",
      label: cycle.kind === "ELECTIVE" ? "Enroll students" : "Add students",
      target: "students",
    };
  }
  if (phase === "placing" && counts.unplaced) {
    return {
      kind: "go",
      label: `Place ${plural(counts.unplaced, "student")}`,
      target: "completion",
    };
  }
  if (counts.ideas?.waiting) {
    return {
      kind: "go",
      label: `Review ${plural(counts.ideas.waiting, "proposal")}`,
      target: "review",
    };
  }
  if (phase === "ended") return { kind: "close", label: "Close the project" };
  if (phase === "ideas") return { kind: "go", label: "See the ideas", target: "teams" };
  if (phase === "work") return { kind: "go", label: "See the submissions", target: "teams" };
  return { kind: "go", label: "See the teams", target: "teams" };
}

export interface AttentionItem {
  key: string;
  text: string;
  action: string;
  target: PageTarget;
}

/** Only things the faculty can act on now; empty when there is nothing, and for a closed cycle. */
export function attentionItems(
  cycle: Cycle,
  phase: CyclePhase,
  counts: CycleCounts,
): AttentionItem[] {
  if (phase === "closed") return [];
  const items: AttentionItem[] = [];
  if (counts.roster?.total === 0) {
    items.push(
      cycle.kind === "ELECTIVE"
        ? {
            key: "students",
            text: "No students are enrolled yet",
            action: "Enroll students",
            target: "students",
          }
        : {
            key: "students",
            text: `No student of batch ${cycle.batchYear} has signed in or been added yet`,
            action: "Add students",
            target: "students",
          },
    );
  }
  if (phase === "placing" && counts.unplaced) {
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
  return items;
}

/** The idea list's one line, in past tense once the cycle is closed. */
export function catalogSummary(phase: CyclePhase, counts: CycleCounts): string {
  const closed = phase === "closed";
  if (counts.failed?.catalog) return "Couldn't load this summary; open it for details";
  const catalog = counts.catalog;
  if (!catalog) return "Loading…";
  if (catalog.offered === 0) {
    return closed ? "No ideas were listed" : "No ideas listed · teams propose their own";
  }
  const offered = closed
    ? `${plural(catalog.offered, "idea was", "ideas were")} offered`
    : `${plural(catalog.offered, "idea")} offered`;
  if (catalog.picked > 0) return `${offered} · picked by ${plural(catalog.picked, "team")}`;
  return `${offered} · ${closed ? "none was picked" : "not picked yet"}`;
}

/** "12 of 15 teams submitted", or why there is nothing to count. */
export function submissionSummary(phase: CyclePhase, counts: CycleCounts): string {
  if (counts.failed?.submissions || counts.failed?.teams) return "Couldn't load the submissions";
  if (counts.teams === undefined || !counts.submissions) return "Loading…";
  if (counts.teams === 0) return phase === "closed" ? "No work was submitted" : "No teams yet";
  return `${counts.submissions.submitted} of ${plural(counts.teams, "team")} submitted`;
}
