import { Injectable } from "@nestjs/common";
import { Transaction } from "../../common/transaction";
import { PrismaService } from "../../prisma/prisma.service";
import {
  NewRefreshToken,
  RefreshTokenRecord,
  RefreshTokenRepository,
} from "../application/ports/refresh-token.repository";

@Injectable()
export class PrismaRefreshTokenRepository extends RefreshTokenRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  create(token: NewRefreshToken, tx: Transaction): Promise<RefreshTokenRecord> {
    return this.prisma.client(tx).refreshToken.create({ data: token });
  }

  findByHash(
    tokenHash: string,
    tx: Transaction,
  ): Promise<RefreshTokenRecord | null> {
    return this.prisma.client(tx).refreshToken.findUnique({
      where: { tokenHash },
    });
  }

  async revokeIfActive(
    id: string,
    at: Date,
    tx: Transaction,
  ): Promise<boolean> {
    const result = await this.prisma.client(tx).refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: at },
    });
    return result.count === 1;
  }

  async markReplaced(
    id: string,
    replacedById: string,
    tx: Transaction,
  ): Promise<void> {
    await this.prisma.client(tx).refreshToken.update({
      where: { id },
      data: { replacedById },
    });
  }

  async hasActiveToken(
    familyId: string,
    now: Date,
    tx: Transaction,
  ): Promise<boolean> {
    const active = await this.prisma.client(tx).refreshToken.findFirst({
      where: { familyId, revokedAt: null, expiresAt: { gt: now } },
      select: { id: true },
    });
    return active !== null;
  }

  async revokeFamily(
    familyId: string,
    at: Date,
    tx: Transaction,
  ): Promise<number> {
    const result = await this.prisma.client(tx).refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: at },
    });
    return result.count;
  }

  async revokeAllForUser(
    userId: string,
    at: Date,
    tx: Transaction,
  ): Promise<number> {
    const result = await this.prisma.client(tx).refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: at },
    });
    return result.count;
  }
}
