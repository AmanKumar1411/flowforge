import type { Grading, TeamEvaluation } from "../types";
import { apiRequest } from "./client";

const base = (cycleId: string, milestoneId: string) => `/course-cycles/${cycleId}/milestones/${milestoneId}`;

/** The scale, the release and every team's evaluation (owning faculty, admins). */
export function getGrading(cycleId: string, milestoneId: string) {
  return apiRequest<Grading>(`${base(cycleId, milestoneId)}/grading`);
}

export function setMaxMarks(cycleId: string, milestoneId: string, maxMarks: number) {
  return apiRequest<Grading>(`${base(cycleId, milestoneId)}/grading`, {
    method: "PUT",
    body: JSON.stringify({ maxMarks }),
  });
}

/** `expectedVersion` is the version read; a newer one on the server is 409 EVALUATION_CHANGED. */
export function saveEvaluation(
  cycleId: string,
  milestoneId: string,
  teamId: string,
  body: { marks?: number | null; feedback: string | null; expectedVersion?: number },
) {
  return apiRequest<TeamEvaluation>(`${base(cycleId, milestoneId)}/teams/${teamId}/evaluation`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function releaseGrading(cycleId: string, milestoneId: string) {
  return apiRequest<Grading>(`${base(cycleId, milestoneId)}/grading/release`, { method: "POST" });
}

/** The team's evaluation for the milestone: empty until released, for its members. */
export function listTeamEvaluations(cycleId: string, milestoneId: string, teamId: string) {
  return apiRequest<TeamEvaluation[]>(`${base(cycleId, milestoneId)}/teams/${teamId}/evaluations`);
}
