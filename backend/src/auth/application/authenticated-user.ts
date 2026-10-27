import type { Role } from "../domain/role";

/** The caller of an authenticated request, loaded from the database on every request. */
export interface AuthenticatedUser {
  id: string;
  role: Role;
  batchYear: number | null;
  /** Normalized. Elective rosters are keyed by email. */
  email: string;
}
