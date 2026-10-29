import { Injectable } from "@nestjs/common";
import { ErrorDetail } from "../../common/errors/domain-error";
import { Transaction } from "../../common/transaction";
import { Cycle } from "../domain/cycle.types";

/** BLOCKING stops the publish; a WARNING is reported with the published cycle. */
export type PublishSeverity = "BLOCKING" | "WARNING";

export interface PublishFinding extends ErrorDetail {
  severity: PublishSeverity;
}

/** Returns what is wrong with publishing the cycle now; nothing when all is well. */
export type PublishCheck = (
  cycle: Cycle,
  tx: Transaction,
) => Promise<readonly PublishFinding[]>;

export interface PublishReport {
  blocking: ErrorDetail[];
  warnings: ErrorDetail[];
}

/**
 * Extension point (ADR 019), like EnrollmentRemovalChecks: modules that build
 * on cycles register what publishing needs from them (ideas: a faculty list
 * that is not empty), so this module never depends on them. Every check runs,
 * so the faculty see every problem at once.
 */
@Injectable()
export class PublishChecks {
  private readonly checks: PublishCheck[] = [];

  register(check: PublishCheck): void {
    this.checks.push(check);
  }

  async run(cycle: Cycle, tx: Transaction): Promise<PublishReport> {
    const report: PublishReport = { blocking: [], warnings: [] };
    // One after another: they share the transaction's connection.
    for (const check of this.checks) {
      for (const { severity, code, message } of await check(cycle, tx)) {
        (severity === "BLOCKING" ? report.blocking : report.warnings).push({
          code,
          message,
        });
      }
    }
    return report;
  }
}
