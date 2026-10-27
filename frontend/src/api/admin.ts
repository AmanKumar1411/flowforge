import type {
  AdminUser,
  AllowlistEntry,
  FacultyRequest,
  FacultyRequestStatus,
  UserPage,
  UserRole,
} from "../types";
import { apiRequest } from "./client";

export function listFacultyRequests(status: FacultyRequestStatus) {
  return apiRequest<FacultyRequest[]>(
    `/admin/faculty-requests?status=${status}`,
  );
}

export function approveFacultyRequest(id: string) {
  return apiRequest<FacultyRequest>(`/admin/faculty-requests/${id}/approve`, {
    method: "POST",
  });
}

export function rejectFacultyRequest(id: string) {
  return apiRequest<FacultyRequest>(`/admin/faculty-requests/${id}/reject`, {
    method: "POST",
  });
}

export function listAllowlist() {
  return apiRequest<AllowlistEntry[]>("/admin/faculty-allowlist");
}

export function addToAllowlist(email: string, name: string) {
  return apiRequest<AllowlistEntry>("/admin/faculty-allowlist", {
    method: "POST",
    body: JSON.stringify({ email, name: name || undefined }),
  });
}

export function removeFromAllowlist(id: string) {
  return apiRequest<void>(`/admin/faculty-allowlist/${id}`, {
    method: "DELETE",
  });
}

export interface UserFilters {
  role?: UserRole;
  batchYear?: number;
  cursor?: string;
}

export function listUsers(filters: UserFilters) {
  const query = new URLSearchParams();
  if (filters.role) query.set("role", filters.role);
  if (filters.batchYear) query.set("batchYear", String(filters.batchYear));
  if (filters.cursor) query.set("cursor", filters.cursor);
  return apiRequest<UserPage>(`/admin/users?${query}`);
}

export function correctBatch(id: string, batchYear: number) {
  return apiRequest<AdminUser>(`/admin/users/${id}/batch`, {
    method: "PATCH",
    body: JSON.stringify({ batchYear }),
  });
}

export function setUserActive(id: string, active: boolean) {
  return apiRequest<AdminUser>(
    `/admin/users/${id}/${active ? "reactivate" : "deactivate"}`,
    { method: "POST" },
  );
}
