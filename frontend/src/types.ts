export type UserRole = "STUDENT" | "FACULTY" | "ADMIN" | "PENDING_STAFF";
export type UserStatus = "ACTIVE" | "DEACTIVATED";
export type CycleStatus = "DRAFT" | "PUBLISHED" | "CLOSED";
export type FacultyRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  batchYear: number | null;
  avatarUrl: string | null;
  facultyRequestStatus: FacultyRequestStatus | null;
}

export interface Cycle {
  id: string;
  courseName: string;
  title: string;
  description: string | null;
  batchYear: number;
  semester: number;
  academicYear: string;
  submissionStartAt: string;
  submissionDeadline: string;
  status: CycleStatus;
  publishedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CycleInput {
  courseName: string;
  title: string;
  description?: string;
  batchYear: number;
  semester: number;
  academicYear: string;
  submissionStartAt: string;
  submissionDeadline: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  batchYear: number | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface UserPage {
  items: AdminUser[];
  nextCursor: string | null;
}

export interface AllowlistEntry {
  id: string;
  email: string;
  name: string | null;
  source: "MANUAL" | "APPROVED_REQUEST" | "CSV_IMPORT";
  addedById: string;
  createdAt: string;
}

export interface FacultyRequest {
  id: string;
  userId: string;
  userName?: string;
  email: string;
  status: FacultyRequestStatus;
  decidedById: string | null;
  decidedAt: string | null;
  createdAt: string;
}
