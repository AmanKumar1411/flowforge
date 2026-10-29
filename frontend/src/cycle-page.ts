import { formatDay } from "./dates";
import type { Cycle } from "./types";

/**
 * What the faculty's cycle page says about a cycle, free of React: which
 * phase it is in, the one thing to do next, what needs attention, and a
 * one-line summary per section. Counts come from the same API calls the
 * sections use; a count that is still loading (or failed) is undefined.
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

export interface CycleCounts {
  /** Students taking part (the batch, or an elective's list), and how many have not signed in. */
  roster?: { total: number; notSignedIn: number };
  catalog?: { offered: number; picked: number };
  teams?: number;
  /** Students without a team, from the team-completion list. */
  unplaced?: number;
  ideas?: { waiting: number; approved: number; rejected: number; none: number };
  submissions?: { submitted: number };
  /** Sections whose counts could not be loaded. */
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
 * Where an action takes the faculty on the page: a collapsible section, the
 * teams list, the teams list showing only ideas waiting for review (or that
 * one team's page), or the students without a team.
 */
export type PageTarget = "students" | "catalog" | "teams" | "review" | "completion";

/** The collapsible section that starts open: the students, while the cycle is a draft. */
export function sectionFor(phase: CyclePhase): SectionKey | null {
  return phase === "draft" ? "students" : null;
}

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

export type PageAction =
  | { kind: "publish"; label: string }
  | { kind: "close"; label: string }
  | { kind: "go"; label: string; target: PageTarget };

/** The single most useful thing to do now. */
export function primaryAction(
  phase: CyclePhase,
  counts: CycleCounts,
): PageAction {
  if (phase === "draft") return { kind: "publish", label: "Publish to students" };
  if (phase === "placing" && counts.unplaced) {
    return {
      kind: "go",
      label: `Place ${plural(counts.unplaced, "student")}`,
      target: "completion",
    };
  }
  if (phase !== "closed" && counts.ideas?.waiting) {
    return {
      kind: "go",
      label: `Review ${plural(counts.ideas.waiting, "idea")}`,
      target: "review",
    };
  }
  if (phase === "ended") return { kind: "close", label: "Close the cycle" };
  if (phase === "teams") return { kind: "go", label: "See the teams", target: "teams" };
  if (phase === "ideas") return { kind: "go", label: "See the ideas", target: "teams" };
  return { kind: "go", label: "View submissions", target: "teams" };
}

export interface AttentionItem {
  key: string;
  text: string;
  action: string;
  target: PageTarget;
}

/** Only things the faculty can act on now; empty when there is nothing. */
export function attentionItems(
  cycle: Cycle,
  phase: CyclePhase,
  counts: CycleCounts,
): AttentionItem[] {
  if (phase === "closed") return [];
  const items: AttentionItem[] = [];
  if (cycle.kind === "ELECTIVE" && counts.roster?.total === 0) {
    items.push({
      key: "enroll",
      text: "No students are enrolled yet",
      action: "Enroll students",
      target: "students",
    });
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
      text: `${plural(counts.ideas.waiting, "idea is", "ideas are")} waiting for your review`,
      action: "Review",
      target: "review",
    });
  }
  if (phase === "work" && counts.ideas) {
    const blocked = counts.ideas.rejected + counts.ideas.none;
    if (blocked > 0) {
      items.push({
        key: "blocked",
        text: `${plural(blocked, "team has", "teams have")} no approved idea, so ${blocked === 1 ? "it" : "they"} can't submit work`,
        action: "See the teams",
        target: "teams",
      });
    }
  }
  return items;
}

/** One line per section, in past tense once the cycle is closed. */
export function sectionSummary(
  section: SectionKey,
  cycle: Cycle,
  phase: CyclePhase,
  counts: CycleCounts,
): string {
  const closed = phase === "closed";
  if (counts.failed?.[section]) return "Couldn't load this summary; open the section for details";
  switch (section) {
    case "students": {
      const roster = counts.roster;
      if (!roster) return "Loading…";
      if (cycle.kind === "ELECTIVE" && roster.total === 0) {
        return closed ? "No students were enrolled" : "No students enrolled yet";
      }
      const who =
        cycle.kind === "ELECTIVE"
          ? `${plural(roster.total, "student")} enrolled`
          : `${plural(roster.total, "student")} in batch ${cycle.batchYear}`;
      return roster.notSignedIn > 0 && !closed
        ? `${who} · ${roster.notSignedIn} not signed in yet`
        : who;
    }
    case "catalog": {
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
    case "teams": {
      if (phase === "draft") return "Students form teams once you publish";
      if (counts.teams === undefined) return "Loading…";
      if (counts.teams === 0) {
        if (closed) return "No teams were formed";
        return phase === "teams"
          ? `No teams yet · students form teams until ${formatDay(cycle.teamFormationDeadline)}`
          : "No teams were formed";
      }
      const teams = plural(counts.teams, "team");
      return counts.unplaced && !closed
        ? `${teams} · ${plural(counts.unplaced, "student")} without a team`
        : teams;
    }
    case "ideas": {
      if (phase === "draft") return `Ideas are due ${formatDay(cycle.ideaDeadline)}`;
      const ideas = counts.ideas;
      if (!ideas) return "Loading…";
      if (counts.teams === 0) {
        return closed ? "No ideas were submitted" : "Ideas come once teams form";
      }
      const parts = closed
        ? [`${ideas.approved} approved`]
        : [`${ideas.waiting} waiting for review`, `${ideas.approved} approved`];
      if (ideas.none > 0) parts.push(`${ideas.none} without an idea`);
      return parts.join(" · ");
    }
    case "submissions": {
      if (phase === "draft") {
        return `Open ${formatDay(cycle.submissionStartAt)} – ${formatDay(cycle.submissionDeadline)}`;
      }
      if (counts.teams === undefined || !counts.submissions) return "Loading…";
      if (counts.teams === 0) {
        return closed ? "No work was submitted" : "Submissions come once teams form";
      }
      if (phase === "teams" || phase === "placing" || phase === "ideas") {
        return `Open ${formatDay(cycle.submissionStartAt)} – ${formatDay(cycle.submissionDeadline)}`;
      }
      return `${counts.submissions.submitted} of ${plural(counts.teams, "team")} ${closed || phase === "ended" ? "submitted work" : "submitted"}`;
    }
  }
}
