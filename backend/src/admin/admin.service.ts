import { Injectable } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { SessionService } from "../auth/application/session.service";
import { BatchYearPolicy } from "../auth/domain/batch-year.policy";
import { Transaction, TransactionRunner } from "../common/transaction";
import { User, UserListQuery, UserPage } from "../users/domain/user";
import { UsersService } from "../users/users.service";
import { AdminDomainError } from "./admin.errors";

/**
 * User administration. Every change goes through UsersService, which bumps
 * tokenVersion, so the user's existing access tokens stop working at once.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionService,
    private readonly batchYearPolicy: BatchYearPolicy,
    private readonly audit: AuditService,
    private readonly transactions: TransactionRunner,
  ) {}

  listUsers(query: UserListQuery): Promise<UserPage> {
    return this.users.list(query);
  }

  /** For late joiners and repeated years. Later logins never overwrite it. */
  async correctBatch(
    actorId: string,
    userId: string,
    batchYear: number,
  ): Promise<User> {
    this.batchYearPolicy.assertValid(batchYear);
    return this.transactions.run(async (tx) => {
      const user = await this.findUser(userId, tx);
      if (user.role !== "STUDENT") {
        throw new AdminDomainError(
          "USER_NOT_A_STUDENT",
          "Only students have a batch year",
        );
      }
      const updated = await this.users.correctBatch(user.id, batchYear, tx);
      await this.audit.record(tx, {
        action: "USER_BATCH_CORRECTED",
        actorId,
        entityType: "User",
        entityId: user.id,
        metadata: { from: user.batchYear, to: batchYear },
      });
      return updated;
    });
  }

  async deactivate(actorId: string, userId: string): Promise<User> {
    if (actorId === userId) {
      throw new AdminDomainError(
        "CANNOT_DEACTIVATE_SELF",
        "You cannot deactivate your own account",
      );
    }
    return this.transactions.run(async (tx) => {
      const user = await this.findUser(userId, tx);
      if (user.status === "DEACTIVATED") return user;
      const updated = await this.users.changeStatus(user.id, "DEACTIVATED", tx);
      await this.sessions.revokeAllForUser(user.id, tx);
      await this.audit.record(tx, {
        action: "USER_DEACTIVATED",
        actorId,
        entityType: "User",
        entityId: user.id,
      });
      return updated;
    });
  }

  async reactivate(actorId: string, userId: string): Promise<User> {
    return this.transactions.run(async (tx) => {
      const user = await this.findUser(userId, tx);
      if (user.status === "ACTIVE") return user;
      const updated = await this.users.changeStatus(user.id, "ACTIVE", tx);
      await this.audit.record(tx, {
        action: "USER_REACTIVATED",
        actorId,
        entityType: "User",
        entityId: user.id,
      });
      return updated;
    });
  }

  private async findUser(id: string, tx: Transaction): Promise<User> {
    const user = await this.users.findById(id, tx);
    if (!user) {
      throw new AdminDomainError("USER_NOT_FOUND", "User not found");
    }
    return user;
  }
}
