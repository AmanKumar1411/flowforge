import type { CycleSubmission, Submission, SubmissionContent } from "../types";
import { apiRequest } from "./client";

/** Every version of the team's work, newest first. */
export function listTeamSubmissions(teamId: string) {
  return apiRequest<Submission[]>(`/teams/${teamId}/submissions`);
}

/** Adds the next version (any member, while submissions are open). */
export function submitWork(teamId: string, content: SubmissionContent) {
  return apiRequest<Submission>(`/teams/${teamId}/submissions`, {
    method: "POST",
    body: JSON.stringify(content),
  });
}

export function listCycleSubmissions(cycleId: string) {
  return apiRequest<CycleSubmission[]>(`/course-cycles/${cycleId}/submissions`);
}
