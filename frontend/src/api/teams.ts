import type {
  AutoGroupPreview,
  CompletionOverview,
  ProposedTeam,
  Team,
  TeamCandidate,
} from "../types";
import { apiRequest } from "./client";

/** Students get their own team (zero or one); the owning faculty and admins get every team. */
export function listCycleTeams(cycleId: string) {
  return apiRequest<Team[]>(`/course-cycles/${cycleId}/teams`);
}

/** Members, the cycle's owning faculty and admins can read a team. */
export function getTeam(teamId: string) {
  return apiRequest<Team>(`/teams/${teamId}`);
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

/** Participants without a team who are looking for one (the caller included). */
export function listSeekers(cycleId: string) {
  return apiRequest<TeamCandidate[]>(`/course-cycles/${cycleId}/looking-for-team`);
}

export function startLooking(cycleId: string, note: string) {
  return apiRequest<void>(`/course-cycles/${cycleId}/looking-for-team`, {
    method: "PUT",
    body: JSON.stringify(note.trim() ? { note: note.trim() } : {}),
  });
}

export function stopLooking(cycleId: string) {
  return apiRequest<void>(`/course-cycles/${cycleId}/looking-for-team`, {
    method: "DELETE",
  });
}

// Faculty team completion (between the formation and completion deadlines)

export function getCompletionOverview(cycleId: string) {
  return apiRequest<CompletionOverview>(
    `/course-cycles/${cycleId}/team-completion`,
  );
}

export function createFacultyTeam(cycleId: string, team: ProposedTeam) {
  return apiRequest<Team>(`/course-cycles/${cycleId}/team-completion/teams`, {
    method: "POST",
    body: JSON.stringify(team),
  });
}

export function addTeamMember(teamId: string, userId: string) {
  return apiRequest<Team>(`/teams/${teamId}/members`, {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
}

export function previewAutoGroup(cycleId: string) {
  return apiRequest<AutoGroupPreview>(
    `/course-cycles/${cycleId}/team-completion/auto-group/preview`,
    { method: "POST" },
  );
}

export function applyAutoGroup(cycleId: string, teams: ProposedTeam[]) {
  return apiRequest<Team[]>(
    `/course-cycles/${cycleId}/team-completion/auto-group`,
    { method: "POST", body: JSON.stringify({ teams }) },
  );
}
