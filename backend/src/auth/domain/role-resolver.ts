import { AuthDomainError } from "./auth.errors";
import { Role, UserStatus } from "./role";
import {
  StaffIdentity,
  UniversityIdentity,
} from "./university-identity-parser";

export interface RoleResolutionInput {
  identity: UniversityIdentity;
  existingUser: { role: Role; status: UserStatus } | null;
  isBootstrapAdmin: boolean;
  isApprovedFaculty: boolean;
}

export type RoleResolution =
  | { outcome: "ASSIGNED"; role: Role }
  | { outcome: "DENIED"; code: "ACCOUNT_DEACTIVATED" | "EMAIL_NOT_ELIGIBLE" };

/**
 * Decides a user's role on every login. The order of the checks is the rule:
 * deactivation first, then a student email always stays STUDENT, and only a
 * staff-shaped email can become ADMIN, FACULTY or PENDING_STAFF.
 */
export class RoleResolver {
  resolve(input: RoleResolutionInput): RoleResolution {
    if (input.existingUser?.status === "DEACTIVATED") {
      return { outcome: "DENIED", code: "ACCOUNT_DEACTIVATED" };
    }

    switch (input.identity.kind) {
      case "STUDENT":
        return { outcome: "ASSIGNED", role: "STUDENT" };
      case "STAFF":
        return { outcome: "ASSIGNED", role: this.staffRole(input) };
      case "UNRECOGNIZED":
        return { outcome: "DENIED", code: "EMAIL_NOT_ELIGIBLE" };
    }
  }

  /** Guards every path that grants FACULTY or ADMIN outside of login. */
  assertCanBeElevated(
    identity: UniversityIdentity,
  ): asserts identity is StaffIdentity {
    if (identity.kind === "STUDENT") {
      throw new AuthDomainError(
        "STUDENT_EMAIL_CANNOT_BE_ELEVATED",
        "A student email can never be given faculty or admin access",
      );
    }
    if (identity.kind !== "STAFF") {
      throw new AuthDomainError(
        "INVALID_STAFF_EMAIL",
        "Only university staff email addresses can be given faculty or admin access",
      );
    }
  }

  private staffRole(input: RoleResolutionInput): Role {
    if (input.isBootstrapAdmin || input.existingUser?.role === "ADMIN") {
      return "ADMIN";
    }
    if (input.isApprovedFaculty) {
      return "FACULTY";
    }
    return "PENDING_STAFF";
  }
}
