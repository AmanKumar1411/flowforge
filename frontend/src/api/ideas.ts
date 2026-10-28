import type { CycleIdea, Idea, IdeaContent, IdeaDecision } from "../types";
import { apiRequest } from "./client";

export async function getTeamIdea(teamId: string) {
  const { idea } = await apiRequest<{ teamId: string; idea: Idea | null }>(
    `/teams/${teamId}/idea`,
  );
  return idea;
}

/** Creates, changes or resubmits the idea; the server decides which is allowed now. */
export function submitIdea(teamId: string, content: IdeaContent) {
  return apiRequest<Idea>(`/teams/${teamId}/idea`, {
    method: "PUT",
    body: JSON.stringify(content),
  });
}

export function reviewIdea(
  teamId: string,
  review: { version: number; decision: IdeaDecision; feedback: string | null },
) {
  return apiRequest<Idea>(`/teams/${teamId}/idea/review`, {
    method: "POST",
    body: JSON.stringify(review),
  });
}

export function listCycleIdeas(cycleId: string) {
  return apiRequest<CycleIdea[]>(`/course-cycles/${cycleId}/ideas`);
}
