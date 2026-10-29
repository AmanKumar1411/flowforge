import type { Cycle, Idea, IdeaStatus, Milestone } from "./types";

/**
 * Mirror the API's idea windows for display only; the API decides. `now`
 * comes from the caller (read once per mount) so rendering stays pure.
 */
export function isIdeaSubmissionOpen(cycle: Cycle, now: number) {
  return cycle.status === "PUBLISHED" && now < Date.parse(cycle.ideaDeadline);
}

/** After a rejection, rounds continue with no deadline while the cycle is published. */
export function isIdeaResubmissionOpen(cycle: Cycle) {
  return cycle.status === "PUBLISHED";
}

const STATUS_LABELS: Record<IdeaStatus, string> = {
  SUBMITTED: "Waiting for review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export function ideaStatusLabel(
  status: IdeaStatus,
  source: Idea["source"] = "PROPOSAL",
) {
  return source === "CATALOG" ? "Picked from the list" : STATUS_LABELS[status];
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
    return isIdeaResubmissionOpen(cycle) ? "RESUBMIT" : null;
  }
  return null;
}

export type SubmissionWindow = "NOT_OPEN" | "OPEN" | "CLOSED";

/** Mirrors the API: a milestone is open from its `submissionOpensAt` until its `submissionDueAt`, while published. */
export function submissionWindow(
  cycle: Pick<Cycle, "status">,
  milestone: Pick<Milestone, "submissionOpensAt" | "submissionDueAt">,
  now: number,
): SubmissionWindow {
  if (cycle.status !== "PUBLISHED" || now >= Date.parse(milestone.submissionDueAt)) {
    return "CLOSED";
  }
  return now < Date.parse(milestone.submissionOpensAt) ? "NOT_OPEN" : "OPEN";
}
