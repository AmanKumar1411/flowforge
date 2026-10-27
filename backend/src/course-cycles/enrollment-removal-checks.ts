import { Injectable } from "@nestjs/common";
import { Transaction } from "../common/transaction";

/** Throws a DomainError to refuse removing the student from the elective. */
export type EnrollmentRemovalCheck = (
  cycleId: string,
  email: string,
  tx: Transaction,
) => Promise<void>;

/**
 * Extension point. Modules that build on cycles register checks that can veto
 * removing a student from an elective (teams: the student is in a team), so
 * this module never depends on them. Checks run inside the removal transaction.
 */
@Injectable()
export class EnrollmentRemovalChecks {
  private readonly checks: EnrollmentRemovalCheck[] = [];

  register(check: EnrollmentRemovalCheck): void {
    this.checks.push(check);
  }

  async assertCanRemove(
    cycleId: string,
    email: string,
    tx: Transaction,
  ): Promise<void> {
    for (const check of this.checks) {
      await check(cycleId, email, tx);
    }
  }
}
