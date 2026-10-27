import { Transaction } from "../../common/transaction";
import { AuditEvent } from "./audit-event";

export abstract class AuditRepository {
  abstract append(event: AuditEvent, tx: Transaction): Promise<void>;
}
