import type { CycleSubmission, Submission, SubmissionContent } from "../types";
import { apiRequest } from "./client";

const teamRoute = (teamId: string, milestoneId: string) =>
  `/teams/${teamId}/milestones/${milestoneId}/submissions`;

/**
 * The team's versions for a milestone, newest first. Without a page, the whole
 * history (a team has at most 50); with one, `limit` versions older than `before`.
 */
export function listTeamSubmissions(teamId: string, milestoneId: string, page?: { limit: number; before?: number }) {
  const query = page ? `?limit=${page.limit}${page.before ? `&before=${page.before}` : ""}` : "";
  return apiRequest<Submission[]>(`${teamRoute(teamId, milestoneId)}${query}`);
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
