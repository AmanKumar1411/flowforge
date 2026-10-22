import { CycleDomainError } from "./cycle.errors";
import { Cycle } from "./cycle.types";

export type CycleActor = {
  id: string;
  role: "STUDENT" | "FACULTY";
  batchYear: number | null;
};

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
      throw new CycleDomainError(
        "NOT_CYCLE_OWNER",
        "Only the faculty owner can manage this cycle",
      );
    }
  }

  canRead(actor: CycleActor, cycle: Cycle): boolean {
    if (actor.role === "FACULTY") {
      return cycle.createdByFacultyId === actor.id;
    }
    return (
      cycle.status === "PUBLISHED" &&
      actor.batchYear !== null &&
      cycle.batchYear === actor.batchYear
    );
  }

  assertStudentBatchAccess(actor: CycleActor, cycle: Cycle): void {
    if (actor.role !== "STUDENT") {
      return;
    }
    if (cycle.status !== "PUBLISHED") {
      throw new CycleDomainError(
        "CYCLE_NOT_FOUND",
        "Published cycle not found",
      );
    }
    if (actor.batchYear !== cycle.batchYear) {
      throw new CycleDomainError(
        "UNAUTHORIZED_BATCH_ACCESS",
        "This cycle is not available for your batch",
      );
    }
  }
}
