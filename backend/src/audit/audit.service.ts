import { Injectable } from "@nestjs/common";
import { Transaction } from "../common/transaction";
import { AuditEvent } from "./domain/audit-event";
import { AuditRepository } from "./domain/audit.repository";

// Secrets never belong in the audit log; a key like this is a programming error.
const secretLikeKey = /token|secret|cookie|password|verifier|nonce/i;

@Injectable()
export class AuditService {
  constructor(private readonly audit: AuditRepository) {}

  /** Writes inside the caller's transaction, so the row commits or rolls back with the change. */
  async record(tx: Transaction, event: AuditEvent): Promise<void> {
    const leaked = Object.keys(event.metadata ?? {}).find((key) =>
      secretLikeKey.test(key),
    );
    if (leaked) {
      throw new Error(`Audit metadata must not contain "${leaked}"`);
    }
    await this.audit.append(event, tx);
  }
}
