import type { StudentDashboard } from "../types";
import { apiRequest } from "./client";

/** Up next, updates and the student's projects (Phase 9, ADR 021). */
export function getDashboard() {
  return apiRequest<StudentDashboard>("/me/dashboard");
}
