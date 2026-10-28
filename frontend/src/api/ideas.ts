import type {
  CatalogIdea,
  CatalogIdeaContent,
  CycleIdea,
  Idea,
  IdeaContent,
  IdeaDecision,
} from "../types";
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

/** Makes a catalog idea the team's idea, approved at once (leader only). */
export function pickIdea(teamId: string, catalogIdeaId: string) {
  return apiRequest<Idea>(`/teams/${teamId}/idea/pick`, {
    method: "POST",
    body: JSON.stringify({ catalogIdeaId }),
  });
}

export function listCatalog(cycleId: string) {
  return apiRequest<CatalogIdea[]>(`/course-cycles/${cycleId}/idea-catalog`);
}

export function addCatalogIdea(cycleId: string, content: CatalogIdeaContent) {
  return apiRequest<CatalogIdea>(`/course-cycles/${cycleId}/idea-catalog`, {
    method: "POST",
    body: JSON.stringify(content),
  });
}

export function updateCatalogIdea(
  cycleId: string,
  id: string,
  content: CatalogIdeaContent,
) {
  return apiRequest<CatalogIdea>(
    `/course-cycles/${cycleId}/idea-catalog/${id}`,
    { method: "PUT", body: JSON.stringify(content) },
  );
}

export function removeCatalogIdea(cycleId: string, id: string) {
  return apiRequest<void>(`/course-cycles/${cycleId}/idea-catalog/${id}`, {
    method: "DELETE",
  });
}
