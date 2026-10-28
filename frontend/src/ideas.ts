import type { Cycle, Idea, IdeaStatus } from "./types";

/**
 * Mirror the API's idea windows for display only; the API decides. `now`
 * comes from the caller (read once per mount) so rendering stays pure.
 */
export function isIdeaSubmissionOpen(cycle: Cycle, now: number) {
  return cycle.status === "PUBLISHED" && now < Date.parse(cycle.ideaDeadline);
}

/** A rejected idea can be resubmitted until submissions open. */
export function isIdeaResubmissionOpen(cycle: Cycle, now: number) {
  return (
    cycle.status === "PUBLISHED" && now < Date.parse(cycle.submissionStartAt)
  );
}

const STATUS_LABELS: Record<IdeaStatus, string> = {
  SUBMITTED: "Waiting for review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export function ideaStatusLabel(status: IdeaStatus) {
  return STATUS_LABELS[status];
}

export type IdeaAction = "SUBMIT" | "EDIT" | "RESUBMIT";

/** What the leader can do with the idea now, if anything. */
export function ideaAction(
  idea: Idea | null,
  cycle: Cycle,
  now: number,
): IdeaAction | null {
  if (!idea) return isIdeaSubmissionOpen(cycle, now) ? "SUBMIT" : null;
  if (idea.status === "SUBMITTED") {
    return isIdeaSubmissionOpen(cycle, now) ? "EDIT" : null;
  }
  if (idea.status === "REJECTED") {
    return isIdeaResubmissionOpen(cycle, now) ? "RESUBMIT" : null;
  }
  return null;
}

/** Waiting ideas first, then rejected ones, teams without one, and approved ones last. */
export function reviewOrder(status: IdeaStatus | null) {
  return status === "SUBMITTED"
    ? 0
    : status === "REJECTED"
      ? 1
      : status === null
        ? 2
        : 3;
}
