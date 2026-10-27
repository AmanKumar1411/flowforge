import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { Clock } from "../../common/clock";
import { Transaction, TransactionRunner } from "../../common/transaction";
import { UsersService } from "../../users/users.service";
import { AuthDomainError } from "../domain/auth.errors";
import { RoleResolver } from "../domain/role-resolver";
import {
  normalizeEmail,
  UniversityIdentityParser,
} from "../domain/university-identity-parser";
import {
  FacultyAccessRequest,
  FacultyAccessRequestWithUser,
  FacultyAllowlistEntry,
  FacultyDirectory,
  FacultyRequestStatus,
} from "./ports/faculty-directory";

/**
 * Admin use cases for faculty access. Every path that grants FACULTY checks
 * the email shape first, so a student email can never be elevated. A future
 * CSV import is one more method here that writes entries with source CSV_IMPORT.
 */
@Injectable()
export class FacultyAccessService {
  constructor(
    private readonly directory: FacultyDirectory,
    private readonly users: UsersService,
    private readonly audit: AuditService,
    private readonly transactions: TransactionRunner,
    private readonly identityParser: UniversityIdentityParser,
    private readonly roleResolver: RoleResolver,
    private readonly clock: Clock,
  ) {}

  listAllowlist(): Promise<FacultyAllowlistEntry[]> {
    return this.directory.listEntries();
  }

  listRequests(
    status?: FacultyRequestStatus,
  ): Promise<FacultyAccessRequestWithUser[]> {
    return this.directory.listRequests(status);
  }

  async addToAllowlist(
    actorId: string,
    rawEmail: string,
    name: string | null,
  ): Promise<FacultyAllowlistEntry> {
    const email = normalizeEmail(rawEmail);
    await this.assertCanBeElevated(actorId, email);
    return this.transactions.run(async (tx) => {
      if (await this.directory.findEntryByEmail(email, tx)) {
        throw new AuthDomainError(
          "ALLOWLIST_ENTRY_EXISTS",
          "This email is already on the faculty allowlist",
        );
      }
      const entry = await this.directory.addEntry(
        { email, name, source: "MANUAL", addedById: actorId },
        tx,
      );
      await this.recordEntryAdded(actorId, entry, tx);
      await this.grantFacultyIfWaiting(actorId, email, tx);
      return entry;
    });
  }

  async removeFromAllowlist(actorId: string, entryId: string): Promise<void> {
    await this.transactions.run(async (tx) => {
      const entry = await this.directory.findEntryById(entryId, tx);
      if (!entry) {
        throw new AuthDomainError(
          "ALLOWLIST_ENTRY_NOT_FOUND",
          "Allowlist entry not found",
        );
      }
      await this.directory.removeEntry(entry.id, tx);
      await this.audit.record(tx, {
        action: "FACULTY_ALLOWLIST_REMOVED",
        actorId,
        entityType: "FacultyAllowlistEntry",
        entityId: entry.id,
        metadata: { email: entry.email },
      });

      const user = await this.users.findByEmail(entry.email, tx);
      if (!user) return;
      if (user.role !== "FACULTY") {
        await this.users.revokeAccessTokens(user.id, tx);
        return;
      }
      // Demote now; tokenVersion moves, so their current access token stops working.
      await this.users.changeRole(user.id, "PENDING_STAFF", tx);
      await this.recordRoleChange(
        actorId,
        user.id,
        "FACULTY",
        "PENDING_STAFF",
        "ALLOWLIST_REMOVED",
        tx,
      );
      const request = await this.directory.decideRequest(
        user.id,
        entry.email,
        {
          status: "REJECTED",
          decidedById: actorId,
          decidedAt: this.clock.now(),
        },
        tx,
      );
      await this.recordDecision(actorId, request, tx);
    });
  }

  async approveRequest(
    actorId: string,
    requestId: string,
  ): Promise<FacultyAccessRequest> {
    const request = await this.findRequest(requestId);
    await this.assertCanBeElevated(actorId, request.email);
    return this.transactions.run(async (tx) => {
      const current = await this.findRequest(requestId, tx);
      if (current.status === "APPROVED") {
        throw this.alreadyDecided();
      }
      const decided = await this.directory.decideRequest(
        current.userId,
        current.email,
        {
          status: "APPROVED",
          decidedById: actorId,
          decidedAt: this.clock.now(),
        },
        tx,
      );
      await this.recordDecision(actorId, decided, tx);

      const user = await this.users.findById(current.userId, tx);
      if (!(await this.directory.findEntryByEmail(current.email, tx))) {
        const entry = await this.directory.addEntry(
          {
            email: current.email,
            name: user?.name ?? null,
            source: "APPROVED_REQUEST",
            addedById: actorId,
          },
          tx,
        );
        await this.recordEntryAdded(actorId, entry, tx);
      }
      if (user?.role === "PENDING_STAFF") {
        await this.users.changeRole(user.id, "FACULTY", tx);
        await this.recordRoleChange(
          actorId,
          user.id,
          "PENDING_STAFF",
          "FACULTY",
          "REQUEST_APPROVED",
          tx,
        );
      }
      return decided;
    });
  }

  /** The user stays PENDING_STAFF and sees "access not granted". An admin can still approve later. */
  async rejectRequest(
    actorId: string,
    requestId: string,
  ): Promise<FacultyAccessRequest> {
    return this.transactions.run(async (tx) => {
      const current = await this.findRequest(requestId, tx);
      if (current.status !== "PENDING") {
        throw this.alreadyDecided();
      }
      const decided = await this.directory.decideRequest(
        current.userId,
        current.email,
        {
          status: "REJECTED",
          decidedById: actorId,
          decidedAt: this.clock.now(),
        },
        tx,
      );
      await this.recordDecision(actorId, decided, tx);
      return decided;
    });
  }

  private async grantFacultyIfWaiting(
    actorId: string,
    email: string,
    tx: Transaction,
  ): Promise<void> {
    const user = await this.users.findByEmail(email, tx);
    if (user?.role !== "PENDING_STAFF") return;
    await this.users.changeRole(user.id, "FACULTY", tx);
    await this.recordRoleChange(
      actorId,
      user.id,
      "PENDING_STAFF",
      "FACULTY",
      "ALLOWLIST_ADDED",
      tx,
    );
    const request = await this.directory.findRequestForUser(user.id, tx);
    if (request && request.status !== "APPROVED") {
      const decided = await this.directory.decideRequest(
        user.id,
        email,
        {
          status: "APPROVED",
          decidedById: actorId,
          decidedAt: this.clock.now(),
        },
        tx,
      );
      await this.recordDecision(actorId, decided, tx);
    }
  }

  private async assertCanBeElevated(
    actorId: string,
    email: string,
  ): Promise<void> {
    try {
      this.roleResolver.assertCanBeElevated(this.identityParser.parse(email));
    } catch (error) {
      if (error instanceof AuthDomainError) {
        await this.transactions.run((tx) =>
          this.audit.record(tx, {
            action: "ELEVATION_DENIED",
            actorId,
            entityType: "FacultyAllowlistEntry",
            entityId: email,
            metadata: { reason: error.code },
          }),
        );
      }
      throw error;
    }
  }

  private async findRequest(
    id: string,
    tx?: Transaction,
  ): Promise<FacultyAccessRequest> {
    const request = await this.directory.findRequestById(id, tx);
    if (!request) {
      throw new AuthDomainError(
        "FACULTY_REQUEST_NOT_FOUND",
        "Faculty access request not found",
      );
    }
    return request;
  }

  private alreadyDecided(): AuthDomainError {
    return new AuthDomainError(
      "FACULTY_REQUEST_ALREADY_DECIDED",
      "This request has already been decided",
    );
  }

  private recordEntryAdded(
    actorId: string,
    entry: FacultyAllowlistEntry,
    tx: Transaction,
  ): Promise<void> {
    return this.audit.record(tx, {
      action: "FACULTY_ALLOWLIST_ADDED",
      actorId,
      entityType: "FacultyAllowlistEntry",
      entityId: entry.id,
      metadata: { email: entry.email, source: entry.source },
    });
  }

  private recordDecision(
    actorId: string,
    request: FacultyAccessRequest,
    tx: Transaction,
  ): Promise<void> {
    return this.audit.record(tx, {
      action:
        request.status === "APPROVED"
          ? "FACULTY_REQUEST_APPROVED"
          : "FACULTY_REQUEST_REJECTED",
      actorId,
      entityType: "FacultyAccessRequest",
      entityId: request.id,
      metadata: { userId: request.userId, email: request.email },
    });
  }

  private recordRoleChange(
    actorId: string,
    userId: string,
    from: string,
    to: string,
    reason: string,
    tx: Transaction,
  ): Promise<void> {
    return this.audit.record(tx, {
      action: "ROLE_ASSIGNED",
      actorId,
      entityType: "User",
      entityId: userId,
      metadata: { from, to, reason },
    });
  }
}
