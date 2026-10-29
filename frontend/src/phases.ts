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

/** The phases of a planned or running cycle; the faculty's window appears only when there is one. */
export function cyclePhases(
  schedule: {
    teamFormationDeadline: string;
    teamCompletionDeadline: string | null;
    ideaDeadline: string;
    submissionStartAt: string;
    submissionDeadline: string;
  },
  start: string,
  closedAt?: string | null,
): Phase[] {
  const settled = schedule.teamCompletionDeadline ?? schedule.teamFormationDeadline;
  const phases: Phase[] = [
    { key: "teams", label: "Teams", start, end: schedule.teamFormationDeadline },
  ];
  if (schedule.teamCompletionDeadline) {
    phases.push({
      key: "placing",
      label: "You place students",
      start: schedule.teamFormationDeadline,
      end: schedule.teamCompletionDeadline,
    });
  }
  phases.push(
    { key: "ideas", label: "Ideas", start: settled, end: schedule.ideaDeadline },
    {
      key: "work",
      label: "Work",
      start: schedule.submissionStartAt,
      end: schedule.submissionDeadline,
    },
  );
  if (closedAt === undefined) return phases;
  if (closedAt === null) {
    return [
      ...phases,
      { key: "closed", label: "Closed", start: schedule.submissionDeadline, end: null, state: "upcoming" },
    ];
  }
  // A closed cycle is over, whatever its dates said.
  return [
    ...phases.map((phase) => ({ ...phase, state: "done" as const })),
    { key: "closed", label: "Closed", start: closedAt, end: null, state: "current" },
  ];
}
