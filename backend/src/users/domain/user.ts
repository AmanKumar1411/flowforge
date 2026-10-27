import type { Role, UserStatus } from "../../auth/domain/role";

export interface User {
  id: string;
  googleSub: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: Role;
  status: UserStatus;
  batchYear: number | null;
  tokenVersion: number;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** The columns every authenticated request needs, read by primary key. */
export type UserAccessState = Pick<
  User,
  "id" | "role" | "status" | "tokenVersion" | "batchYear" | "email"
>;

export interface NewUser {
  googleSub: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: Role;
  batchYear: number | null;
  lastLoginAt: Date;
}

/** Refreshed from the identity provider on every login. Never includes batchYear. */
export interface UserProfile {
  email: string;
  name: string;
  avatarUrl: string | null;
  lastLoginAt: Date;
}

export interface UserAccessChange {
  role?: Role;
  status?: UserStatus;
  batchYear?: number;
}

export interface UserListQuery {
  role?: Role;
  status?: UserStatus;
  batchYear?: number;
  cursor?: string;
  limit: number;
}

export interface UserPage {
  items: User[];
  nextCursor: string | null;
}

/** The students who take part in a cycle: a whole batch, or an elective's enrolled emails. */
export type StudentScope =
  { batchYear: number } | { emails: readonly string[] };

export interface StudentSearch {
  scope: StudentScope;
  /** Matches a name containing it or an email starting with it, ignoring case. */
  query: string;
  limit: number;
}
