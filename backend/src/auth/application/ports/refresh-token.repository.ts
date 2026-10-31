import { Transaction } from "../../../common/transaction";

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  familyExpiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export type NewRefreshToken = Pick<
  RefreshTokenRecord,
  | "userId"
  | "familyId"
  | "tokenHash"
  | "expiresAt"
  | "familyExpiresAt"
  | "userAgent"
>;

export abstract class RefreshTokenRepository {
  abstract create(
    token: NewRefreshToken,
    tx: Transaction,
  ): Promise<RefreshTokenRecord>;
  abstract findByHash(
    tokenHash: string,
    tx: Transaction,
  ): Promise<RefreshTokenRecord | null>;
  /** Compare-and-set: returns false when the token was already revoked, e.g. by a concurrent rotation. */
  abstract revokeIfActive(
    id: string,
    at: Date,
    tx: Transaction,
  ): Promise<boolean>;
  abstract markReplaced(
    id: string,
    replacedById: string,
    tx: Transaction,
  ): Promise<void>;
  /** Whether the family still has a token that is neither revoked nor expired. */
  abstract hasActiveToken(
    familyId: string,
    now: Date,
    tx: Transaction,
  ): Promise<boolean>;
  abstract revokeFamily(
    familyId: string,
    at: Date,
    tx: Transaction,
  ): Promise<number>;
  abstract revokeAllForUser(
    userId: string,
    at: Date,
    tx: Transaction,
  ): Promise<number>;
}
