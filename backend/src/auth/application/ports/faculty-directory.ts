import { Transaction } from "../../../common/transaction";

export type FacultyAllowlistSource =
  "MANUAL" | "APPROVED_REQUEST" | "CSV_IMPORT";

export type FacultyRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface FacultyAllowlistEntry {
  id: string;
  email: string;
  name: string | null;
  source: FacultyAllowlistSource;
  addedById: string;
  createdAt: Date;
}

export type NewAllowlistEntry = Pick<
  FacultyAllowlistEntry,
  "email" | "name" | "source" | "addedById"
>;

export interface FacultyAccessRequest {
  id: string;
  userId: string;
  email: string;
  status: FacultyRequestStatus;
  decidedById: string | null;
  decidedAt: Date | null;
  createdAt: Date;
}

export interface FacultyAccessRequestWithUser extends FacultyAccessRequest {
  userName: string;
}

export interface FacultyRequestDecision {
  status: "APPROVED" | "REJECTED";
  decidedById: string;
  decidedAt: Date;
}

/**
 * Who is approved faculty (the allowlist) and who has asked to be (access
 * requests). Every source of faculty, today's admin approvals and a later CSV
 * import, writes the same allowlist, so login never needs to change.
 */
export abstract class FacultyDirectory {
  abstract isApproved(email: string, tx: Transaction): Promise<boolean>;
  abstract listEntries(): Promise<FacultyAllowlistEntry[]>;
  abstract findEntryById(
    id: string,
    tx: Transaction,
  ): Promise<FacultyAllowlistEntry | null>;
  abstract findEntryByEmail(
    email: string,
    tx: Transaction,
  ): Promise<FacultyAllowlistEntry | null>;
  abstract addEntry(
    entry: NewAllowlistEntry,
    tx: Transaction,
  ): Promise<FacultyAllowlistEntry>;
  abstract removeEntry(id: string, tx: Transaction): Promise<void>;

  /** Creates a PENDING request unless the user already has one in any status. True if created. */
  abstract createRequestIfAbsent(
    userId: string,
    email: string,
    tx: Transaction,
  ): Promise<boolean>;
  abstract findRequestById(
    id: string,
    tx?: Transaction,
  ): Promise<FacultyAccessRequest | null>;
  abstract findRequestForUser(
    userId: string,
    tx?: Transaction,
  ): Promise<FacultyAccessRequest | null>;
  abstract listRequests(
    status?: FacultyRequestStatus,
  ): Promise<FacultyAccessRequestWithUser[]>;
  /** Records a decision, creating the request when the user never asked (manual add or removal). */
  abstract decideRequest(
    userId: string,
    email: string,
    decision: FacultyRequestDecision,
    tx: Transaction,
  ): Promise<FacultyAccessRequest>;
}
