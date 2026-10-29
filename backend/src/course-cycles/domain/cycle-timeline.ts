import { Clock } from "../../common/clock";
import { CycleStatus } from "./cycle.types";
import { Milestone } from "./milestone";

export type TimelineMilestone = Pick<
  Milestone,
  | "id"
  | "position"
  | "name"
  | "submissionOpensAt"
  | "submissionDueAt"
  | "evaluationAt"
>;

/** What the timeline reads from a cycle. */
export interface TimelineCycle {
  status: CycleStatus;
  teamDeadline: Date;
  ideaDeadline: Date;
  /** In position order. */
  milestones: readonly TimelineMilestone[];
}

/** Where a milestone stands: not open yet, taking submissions, or due and waiting to be evaluated. */
export type MilestonePhase = "UPCOMING" | "OPEN" | "AWAITING_EVALUATION";

export type CycleStage =
  | { kind: "DRAFT" | "TEAMS" | "IDEAS" | "WRAP_UP" | "CLOSED" }
  | { kind: "MILESTONE"; milestone: TimelineMilestone; phase: MilestonePhase };

export type CycleEventKind =
  | "TEAM_DEADLINE"
  | "IDEA_DEADLINE"
  | "SUBMISSION_OPENS"
  | "SUBMISSION_DUE"
  | "EVALUATION";

export interface CycleEvent {
  kind: CycleEventKind;
  at: Date;
  milestone?: TimelineMilestone;
}

// At the same moment, what closes comes before what opens.
const order: Record<CycleEventKind, number> = {
  TEAM_DEADLINE: 0,
  IDEA_DEADLINE: 1,
  SUBMISSION_DUE: 2,
  EVALUATION: 3,
  SUBMISSION_OPENS: 4,
};

/**
 * Where a cycle is and what comes next, computed from its dates and the
 * clock alone: nothing is stored, so it is never out of date (ADR 017).
 * Every window closes at its deadline, so an event at exactly "now" has
 * already happened.
 */
export class CycleTimeline {
  constructor(private readonly clock: Clock) {}

  currentStage(cycle: TimelineCycle): CycleStage {
    if (cycle.status === "DRAFT") return { kind: "DRAFT" };
    if (cycle.status === "CLOSED") return { kind: "CLOSED" };
    const now = this.clock.now();
    if (now < cycle.teamDeadline) return { kind: "TEAMS" };
    if (now < cycle.ideaDeadline) return { kind: "IDEAS" };
    const open = cycle.milestones.find(
      (m) => m.submissionOpensAt <= now && now < m.submissionDueAt,
    );
    if (open) return { kind: "MILESTONE", milestone: open, phase: "OPEN" };
    const waiting = [...cycle.milestones]
      .reverse()
      .find((m) => m.submissionDueAt <= now && now < m.evaluationAt);
    if (waiting) {
      return {
        kind: "MILESTONE",
        milestone: waiting,
        phase: "AWAITING_EVALUATION",
      };
    }
    const next = cycle.milestones.find((m) => now < m.submissionOpensAt);
    if (next) return { kind: "MILESTONE", milestone: next, phase: "UPCOMING" };
    return { kind: "WRAP_UP" };
  }

  /** The next `limit` events after now, in time order; none for a closed cycle. */
  upcomingEvents(cycle: TimelineCycle, limit = 3): CycleEvent[] {
    if (cycle.status === "CLOSED") return [];
    const now = this.clock.now();
    return this.events(cycle)
      .filter((event) => event.at > now)
      .sort(byTime)
      .slice(0, limit);
  }

  private events(cycle: TimelineCycle): CycleEvent[] {
    return [
      { kind: "TEAM_DEADLINE", at: cycle.teamDeadline },
      { kind: "IDEA_DEADLINE", at: cycle.ideaDeadline },
      ...cycle.milestones.flatMap((milestone): CycleEvent[] => [
        {
          kind: "SUBMISSION_OPENS",
          at: milestone.submissionOpensAt,
          milestone,
        },
        { kind: "SUBMISSION_DUE", at: milestone.submissionDueAt, milestone },
        { kind: "EVALUATION", at: milestone.evaluationAt, milestone },
      ]),
    ];
  }
}

/** Time, then what closes before what opens, then milestone order. */
export function byTime(a: CycleEvent, b: CycleEvent): number {
  return (
    a.at.getTime() - b.at.getTime() ||
    order[a.kind] - order[b.kind] ||
    (a.milestone?.position ?? 0) - (b.milestone?.position ?? 0)
  );
}
