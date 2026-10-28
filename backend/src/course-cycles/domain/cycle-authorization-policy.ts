import type { Role } from "../../auth/domain/role";
import { CycleDomainError } from "./cycle.errors";
import { Cycle } from "./cycle.types";

export type CycleActor = {
  id: string;
  role: Role;
  batchYear: number | null;
  email: string;
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

  /** `enrolled`: whether a student actor is on the cycle's elective roster (ignored for core courses). */
  canRead(actor: CycleActor, cycle: Cycle, enrolled: boolean): boolean {
    switch (actor.role) {
      case "FACULTY":
        return cycle.createdByFacultyId === actor.id;
      case "STUDENT":
        if (cycle.status !== "PUBLISHED") return false;
        return cycle.kind === "ELECTIVE"
          ? enrolled
          : actor.batchYear !== null && cycle.batchYear === actor.batchYear;
      case "ADMIN":
        return cycle.status !== "DRAFT";
      case "PENDING_STAFF":
        return false;
    }
  }

  assertCanRead(actor: CycleActor, cycle: Cycle, enrolled: boolean): void {
    if (!this.canRead(actor, cycle, enrolled)) {
      throw this.notFound();
    }
  }

  /** Elective rosters change only before the cycle closes, and only for electives. */
  assertCanManageRoster(actor: CycleActor, cycle: Cycle): void {
    this.assertOwner(actor, cycle);
    if (cycle.kind !== "ELECTIVE") {
      throw new CycleDomainError(
        "CYCLE_NOT_ELECTIVE",
        "Only electives have an enrollment list; a core course includes the whole batch",
      );
    }
  }

  /** A core course's batch list is imported by its faculty, before the cycle closes. */
  assertCanManageBatch(actor: CycleActor, cycle: Cycle): void {
    this.assertOwner(actor, cycle);
    if (cycle.kind !== "CORE") {
      throw new CycleDomainError(
        "CYCLE_NOT_CORE",
        "An elective has an enrollment list instead of a batch list",
      );
    }
  }

  private notFound(): CycleDomainError {
    return new CycleDomainError("CYCLE_NOT_FOUND", "Course cycle not found");
  }
}
