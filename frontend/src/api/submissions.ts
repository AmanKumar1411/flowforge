import type { CycleSubmission, Submission, SubmissionContent } from "../types";
import { apiRequest } from "./client";

const teamRoute = (teamId: string, milestoneId: string) =>
  `/teams/${teamId}/milestones/${milestoneId}/submissions`;

/** Every version of the team's work for a milestone, newest first. */
export function listTeamSubmissions(teamId: string, milestoneId: string) {
  return apiRequest<Submission[]>(teamRoute(teamId, milestoneId));
}

/** Adds the next version (any member, while the milestone is open). */
export function submitWork(teamId: string, milestoneId: string, content: SubmissionContent) {
  return apiRequest<Submission>(teamRoute(teamId, milestoneId), {
    method: "POST",
    body: JSON.stringify(content),
  });
}

/** Every team of the cycle with its work for one milestone (owning faculty, admins). */
export function listCycleSubmissions(cycleId: string, milestoneId: string) {
  return apiRequest<CycleSubmission[]>(
    `/course-cycles/${cycleId}/milestones/${milestoneId}/submissions`,
  );
}
