import { randomUUID } from "node:crypto";
import {
  NewRefreshToken,
  RefreshTokenRecord,
  RefreshTokenRepository,
} from "../application/ports/refresh-token.repository";

export class InMemoryRefreshTokenRepository extends RefreshTokenRepository {
  readonly records = new Map<string, RefreshTokenRecord>();

  async create(token: NewRefreshToken): Promise<RefreshTokenRecord> {
    const record: RefreshTokenRecord = {
      ...token,
      id: randomUUID(),
      revokedAt: null,
      replacedById: null,
      createdAt: new Date(),
    };
    this.records.set(record.id, record);
    return record;
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    return (
      [...this.records.values()].find((r) => r.tokenHash === tokenHash) ?? null
    );
  }

  async revokeIfActive(id: string, at: Date): Promise<boolean> {
    const record = this.records.get(id);
    if (!record || record.revokedAt) return false;
    record.revokedAt = at;
    return true;
  }

  async markReplaced(id: string, replacedById: string): Promise<void> {
    const record = this.records.get(id);
    if (record) record.replacedById = replacedById;
  }

  async hasActiveToken(familyId: string, now: Date): Promise<boolean> {
    return [...this.records.values()].some(
      (r) => r.familyId === familyId && !r.revokedAt && r.expiresAt > now,
    );
  }

  async revokeFamily(familyId: string, at: Date): Promise<number> {
    return this.revokeWhere((r) => r.familyId === familyId, at);
  }

  async revokeAllForUser(userId: string, at: Date): Promise<number> {
    return this.revokeWhere((r) => r.userId === userId, at);
  }

  private revokeWhere(
    matches: (record: RefreshTokenRecord) => boolean,
    at: Date,
  ): number {
    let count = 0;
    for (const record of this.records.values()) {
      if (matches(record) && !record.revokedAt) {
        record.revokedAt = at;
        count += 1;
      }
    }
    return count;
  }
}
