import { Transaction } from "../../common/transaction";
import {
  Cycle,
  CycleCreateData,
  CyclePatch,
  CycleStatus,
  Enrollment,
} from "./cycle.types";

/** The cycle aggregate: the cycle and, for an elective, its enrollment list. */
export abstract class CycleRepository {
  abstract create(data: CycleCreateData): Promise<Cycle>;
  abstract findById(id: string): Promise<Cycle | null>;
  abstract listByOwner(ownerId: string): Promise<Cycle[]>;
  /** Published core cycles of the batch, plus published electives the email is enrolled in. */
  abstract listPublishedForStudent(
    batchYear: number | null,
    email: string,
  ): Promise<Cycle[]>;
  abstract listPublishedOrClosed(): Promise<Cycle[]>;
  abstract updateFields(
    id: string,
    expectedStatus: CycleStatus,
    fields: CyclePatch,
  ): Promise<Cycle | null>;
  abstract transitionStatus(
    id: string,
    expectedStatus: CycleStatus,
    nextStatus: CycleStatus,
    timestamp: Date,
  ): Promise<Cycle | null>;

  abstract isEnrolled(cycleId: string, email: string): Promise<boolean>;
  abstract listEnrollments(
    cycleId: string,
    tx?: Transaction,
  ): Promise<Enrollment[]>;
  /** Skips emails that are already enrolled. */
  abstract addEnrollments(
    cycleId: string,
    emails: readonly string[],
    addedById: string,
    tx: Transaction,
  ): Promise<void>;
  /** False when the email was not enrolled. */
  abstract removeEnrollment(
    cycleId: string,
    email: string,
    tx: Transaction,
  ): Promise<boolean>;
}
