import type {
  BatchImportResult,
  BatchStudent,
  Cycle,
  CyclePayload,
  EnrolledStudent,
  EnrollmentResult,
  ErrorDetail,
  PublishChecks,
  UpcomingEvent,
} from "../types";
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

export function createCycle(input: CyclePayload) {
  return apiRequest<Cycle>("/course-cycles", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateCycle(id: string, input: Partial<CyclePayload>) {
  return apiRequest<Cycle>(`/course-cycles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/** Publishes, or fails with PUBLISH_BLOCKED listing every problem in `details`. */
export function publishCycle(id: string) {
  return apiRequest<Cycle & { warnings: ErrorDetail[] }>(
    `/course-cycles/${id}/publish`,
    { method: "POST" },
  );
}

/** What publishing would report now, without publishing. */
export function getPublishChecks(id: string) {
  return apiRequest<PublishChecks>(`/course-cycles/${id}/publish-checks`);
}

/** The student's next events across their projects, soonest first. */
export function listUpcoming() {
  return apiRequest<UpcomingEvent[]>("/me/upcoming");
}

export function closeCycle(id: string) {
  return apiRequest<Cycle>(`/course-cycles/${id}/close`, { method: "POST" });
}

export function listEnrollments(cycleId: string) {
  return apiRequest<EnrolledStudent[]>(`/course-cycles/${cycleId}/enrollments`);
}

export function addEnrollments(cycleId: string, emails: string[]) {
  return apiRequest<EnrollmentResult>(`/course-cycles/${cycleId}/enrollments`, {
    method: "POST",
    body: JSON.stringify({ emails }),
  });
}

export function removeEnrollment(cycleId: string, email: string) {
  return apiRequest<void>(
    `/course-cycles/${cycleId}/enrollments/${encodeURIComponent(email)}`,
    { method: "DELETE" },
  );
}

export function listBatchStudents(cycleId: string) {
  return apiRequest<BatchStudent[]>(`/course-cycles/${cycleId}/batch-students`);
}

export function importBatchStudents(cycleId: string, emails: string[]) {
  return apiRequest<BatchImportResult>(
    `/course-cycles/${cycleId}/batch-students`,
    { method: "POST", body: JSON.stringify({ emails }) },
  );
}
