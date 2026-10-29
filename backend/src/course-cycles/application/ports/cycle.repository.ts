import { Transaction } from "../../../common/transaction";
import {
  Cycle,
  CycleCreateData,
  CyclePatch,
  CycleStatus,
  Enrollment,
} from "../../domain/cycle.types";
import { MilestonePlan, PlacedMilestone } from "../../domain/milestone";

/** The cycle aggregate: the cycle, its milestones and, for an elective, its enrollment list. */
export abstract class CycleRepository {
  /** The cycle and its milestones, together. */
  abstract create(
    data: CycleCreateData,
    milestones: readonly PlacedMilestone[],
    tx: Transaction,
  ): Promise<Cycle>;
  abstract findById(id: string, tx?: Transaction): Promise<Cycle | null>;
  /** Locks the cycle row (FOR UPDATE) for the rest of the transaction, then reads it. */
  abstract lockById(id: string, tx: Transaction): Promise<Cycle | null>;
  abstract listByOwner(ownerId: string): Promise<Cycle[]>;
  /** Published core cycles of the batch, plus published electives the email is enrolled in. */
  abstract listPublishedForStudent(
    batchYear: number | null,
    email: string,
  ): Promise<Cycle[]>;
  abstract listPublishedOrClosed(): Promise<Cycle[]>;
  /** Saves the fields and, if given, the milestone plan; null when the cycle is no longer in `expectedStatus`. */
  abstract update(
    id: string,
    expectedStatus: CycleStatus,
    fields: CyclePatch,
    milestones: MilestonePlan | null,
    tx: Transaction,
  ): Promise<Cycle | null>;
  abstract transitionStatus(
    id: string,
    expectedStatus: CycleStatus,
    nextStatus: CycleStatus,
    timestamp: Date,
    tx: Transaction,
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
