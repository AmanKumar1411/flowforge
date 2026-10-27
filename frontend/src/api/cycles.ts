import type { Cycle, CycleInput } from "../types";
import { apiRequest } from "./client";

export function listCycles() {
  return apiRequest<Cycle[]>("/course-cycles");
}

export function listMyCycles() {
  return apiRequest<Cycle[]>("/course-cycles/my");
}

export function getCycle(id: string) {
  return apiRequest<Cycle>(`/course-cycles/${id}`);
}

export function createCycle(input: CycleInput) {
  return apiRequest<Cycle>("/course-cycles", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateCycle(id: string, input: Partial<CycleInput>) {
  return apiRequest<Cycle>(`/course-cycles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function publishCycle(id: string) {
  return apiRequest<Cycle>(`/course-cycles/${id}/publish`, { method: "POST" });
}

export function closeCycle(id: string) {
  return apiRequest<Cycle>(`/course-cycles/${id}/close`, { method: "POST" });
}
