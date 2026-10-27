import type { Team, TeamCandidate } from "../types";
import { apiRequest } from "./client";

/** Students get their own team (zero or one); the owning faculty and admins get every team. */
export function listCycleTeams(cycleId: string) {
  return apiRequest<Team[]>(`/course-cycles/${cycleId}/teams`);
}

export function listMyTeams() {
  return apiRequest<Team[]>("/teams/mine");
}

export function searchTeamCandidates(cycleId: string, query: string) {
  return apiRequest<TeamCandidate[]>(
    `/course-cycles/${cycleId}/team-candidates?q=${encodeURIComponent(query)}`,
  );
}

/** `memberIds` are the other members; the caller becomes the leader. */
export function createTeam(
  cycleId: string,
  input: { name: string; memberIds: string[] },
) {
  return apiRequest<Team>(`/course-cycles/${cycleId}/teams`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** `memberIds` replaces the other members; the leader always stays. */
export function updateTeam(
  teamId: string,
  input: { name?: string; memberIds?: string[] },
) {
  return apiRequest<Team>(`/teams/${teamId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function disbandTeam(teamId: string) {
  return apiRequest<void>(`/teams/${teamId}`, { method: "DELETE" });
}
