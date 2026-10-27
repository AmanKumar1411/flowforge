import type { Role } from "../../auth/domain/role";
import { CycleDomainError } from "./cycle.errors";
import { Cycle } from "./cycle.types";

export type CycleActor = {
  id: string;
  role: Role;
  batchYear: number | null;
};

/**
 * Resource-level rules that sit behind the role guard. A cycle the actor may
 * not see is reported as not found, so its existence is never revealed.
 */
export class CycleAuthorizationPolicy {
  assertFaculty(actor: CycleActor): void {
    if (actor.role !== "FACULTY") {
      throw new CycleDomainError(
        "NOT_CYCLE_OWNER",
        "Only faculty members can manage course cycles",
      );
    }
  }

  assertOwner(actor: CycleActor, cycle: Cycle): void {
    this.assertFaculty(actor);
    if (cycle.createdByFacultyId !== actor.id) {
      throw this.notFound();
    }
  }

  canRead(actor: CycleActor, cycle: Cycle): boolean {
    switch (actor.role) {
      case "FACULTY":
        return cycle.createdByFacultyId === actor.id;
      case "STUDENT":
        return (
          cycle.status === "PUBLISHED" &&
          actor.batchYear !== null &&
          cycle.batchYear === actor.batchYear
        );
      case "ADMIN":
        return cycle.status !== "DRAFT";
      case "PENDING_STAFF":
        return false;
    }
  }

  assertCanRead(actor: CycleActor, cycle: Cycle): void {
    if (!this.canRead(actor, cycle)) {
      throw this.notFound();
    }
  }

  private notFound(): CycleDomainError {
    return new CycleDomainError("CYCLE_NOT_FOUND", "Course cycle not found");
  }
}
