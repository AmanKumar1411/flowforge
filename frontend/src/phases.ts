// A cycle's phases, for the wizard's plan and the cycle page's timeline.

export interface Phase {
  key: string;
  label: string;
  /** ISO start and end; the open-ended "Closed" phase has no end. */
  start: string;
  end: string | null;
  /** Set when the dates alone cannot tell (a cycle closes when its faculty close it). */
  state?: PhaseState;
}

export type PhaseState = "done" | "current" | "upcoming";

export interface PhaseSchedule {
  teamDeadline: string;
  ideaDeadline: string;
  milestones: { position: number; name: string; submissionOpensAt: string; submissionDueAt: string }[];
}

/**
 * Teams, then ideas (while the faculty place students left without a team),
 * then each milestone's submission window, then "Closed".
 */
export function cyclePhases(
  schedule: PhaseSchedule,
  start: string,
  closedAt?: string | null,
  ideasLabel = "Ideas · you place students",
): Phase[] {
  const phases: Phase[] = [
    { key: "teams", label: "Teams", start, end: schedule.teamDeadline },
    { key: "ideas", label: ideasLabel, start: schedule.teamDeadline, end: schedule.ideaDeadline },
    ...schedule.milestones.map((milestone) => ({
      key: `m${milestone.position}`,
      label: `M${milestone.position} · ${milestone.name}`,
      start: milestone.submissionOpensAt,
      end: milestone.submissionDueAt,
    })),
  ];
  const last = schedule.milestones.at(-1)?.submissionDueAt ?? schedule.ideaDeadline;
  if (closedAt === undefined) return phases;
  if (closedAt === null) {
    return [
      ...phases,
      { key: "closed", label: "Closed", start: last, end: null, state: "upcoming" },
    ];
  }
  // A closed cycle is over, whatever its dates said.
  return [
    ...phases.map((phase) => ({ ...phase, state: "done" as const })),
    { key: "closed", label: "Closed", start: closedAt, end: null, state: "current" },
  ];
}
