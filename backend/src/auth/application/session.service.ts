import { Injectable } from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { AuditService } from "../../audit/audit.service";
import { Clock } from "../../common/clock";
import { Transaction, TransactionRunner } from "../../common/transaction";
import { AppConfig } from "../../config/app-config";
import { UsersService } from "../../users/users.service";
import { AuthDomainError } from "../domain/auth.errors";
import {
  RefreshTokenRecord,
  RefreshTokenRepository,
} from "./ports/refresh-token.repository";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface IssuedRefreshToken {
  value: string;
  expiresAt: Date;
}

export interface RotatedSession {
  userId: string;
  refreshToken: IssuedRefreshToken;
}

type RotationOutcome =
  | { kind: "ROTATED"; session: RotatedSession }
  | { kind: "DENIED"; error: AuthDomainError };

export const hashRefreshToken = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

/**
 * Refresh-token families. A login starts a family; each refresh revokes the
 * presented token and issues its successor. Presenting a token that was
 * already rotated means it was copied, so the whole family is revoked.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly tokens: RefreshTokenRepository,
    private readonly users: UsersService,
    private readonly audit: AuditService,
    private readonly transactions: TransactionRunner,
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {}

  async startFamily(
    userId: string,
    userAgent: string | null,
    tx: Transaction,
  ): Promise<IssuedRefreshToken> {
    const now = this.clock.now();
    const familyExpiresAt = new Date(
      now.getTime() + this.config.values.sessions.refreshFamilyMaxDays * DAY_MS,
    );
    const { issued } = await this.issue(
      { userId, familyId: randomUUID(), familyExpiresAt, userAgent },
      now,
      tx,
    );
    return issued;
  }

  async rotate(
    presented: string,
    userAgent: string | null,
  ): Promise<RotatedSession> {
    // Denials are returned, not thrown, so a family revocation and its audit row still commit.
    const outcome = await this.transactions.run((tx) =>
      this.tryRotate(presented, userAgent, tx),
    );
    if (outcome.kind === "DENIED") {
      throw outcome.error;
    }
    return outcome.session;
  }

  /** Ends the family of the presented token (logout). Returns it, or null if it is unknown. */
  async revokeFamilyOf(
    presented: string,
    tx: Transaction,
  ): Promise<RefreshTokenRecord | null> {
    const token = await this.tokens.findByHash(hashRefreshToken(presented), tx);
    if (token) {
      await this.tokens.revokeFamily(token.familyId, this.clock.now(), tx);
    }
    return token;
  }

  async revokeAllForUser(userId: string, tx: Transaction): Promise<void> {
    await this.tokens.revokeAllForUser(userId, this.clock.now(), tx);
  }

  private async tryRotate(
    presented: string,
    userAgent: string | null,
    tx: Transaction,
  ): Promise<RotationOutcome> {
    const now = this.clock.now();
    const current = await this.tokens.findByHash(
      hashRefreshToken(presented),
      tx,
    );
    if (!current) {
      return this.deny("INVALID_REFRESH_TOKEN", "Refresh token is not valid");
    }
    if (current.revokedAt) {
      return current.replacedById
        ? this.handleReuse(current, now, tx)
        : this.deny("TOKEN_REVOKED", "This session has ended");
    }
    if (now >= current.expiresAt || now >= current.familyExpiresAt) {
      return this.deny("INVALID_REFRESH_TOKEN", "Refresh token has expired");
    }

    const user = await this.users.findById(current.userId, tx);
    if (!user || user.status === "DEACTIVATED") {
      await this.tokens.revokeFamily(current.familyId, now, tx);
      return this.deny("ACCOUNT_DEACTIVATED", "This account is deactivated");
    }

    if (!(await this.tokens.revokeIfActive(current.id, now, tx))) {
      // Another request rotated this token between our read and our write.
      return this.handleReuse(current, now, tx);
    }
    const next = await this.issue(
      {
        userId: current.userId,
        familyId: current.familyId,
        familyExpiresAt: current.familyExpiresAt,
        userAgent,
      },
      now,
      tx,
    );
    await this.tokens.markReplaced(current.id, next.record.id, tx);
    return {
      kind: "ROTATED",
      session: { userId: current.userId, refreshToken: next.issued },
    };
  }

  private async handleReuse(
    token: RefreshTokenRecord,
    now: Date,
    tx: Transaction,
  ): Promise<RotationOutcome> {
    await this.tokens.revokeFamily(token.familyId, now, tx);
    await this.audit.record(tx, {
      action: "REFRESH_TOKEN_REUSE_DETECTED",
      actorId: null,
      entityType: "RefreshTokenFamily",
      entityId: token.familyId,
      metadata: { userId: token.userId },
    });
    return this.deny(
      "REFRESH_TOKEN_REUSED",
      "This refresh token was already used; all sessions in its family were ended",
    );
  }

  private async issue(
    family: {
      userId: string;
      familyId: string;
      familyExpiresAt: Date;
      userAgent: string | null;
    },
    now: Date,
    tx: Transaction,
  ): Promise<{ issued: IssuedRefreshToken; record: RefreshTokenRecord }> {
    const value = randomBytes(32).toString("base64url");
    const ttl = this.config.values.sessions.refreshTokenTtlDays * DAY_MS;
    const expiresAt = new Date(
      Math.min(now.getTime() + ttl, family.familyExpiresAt.getTime()),
    );
    const record = await this.tokens.create(
      { ...family, tokenHash: hashRefreshToken(value), expiresAt },
      tx,
    );
    return { issued: { value, expiresAt }, record };
  }

  private deny(
    code:
      | "INVALID_REFRESH_TOKEN"
      | "TOKEN_REVOKED"
      | "REFRESH_TOKEN_REUSED"
      | "ACCOUNT_DEACTIVATED",
    message: string,
  ): RotationOutcome {
    return { kind: "DENIED", error: new AuthDomainError(code, message) };
  }
}
