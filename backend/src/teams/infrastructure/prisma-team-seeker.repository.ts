import { Injectable } from "@nestjs/common";
import { Transaction } from "../../common/transaction";
import { PrismaService } from "../../prisma/prisma.service";
import { TeamSeekerRepository } from "../application/ports/team-seeker.repository";
import { TeamSeeker } from "../domain/team";

@Injectable()
export class PrismaTeamSeekerRepository extends TeamSeekerRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async save(
    cycleId: string,
    userId: string,
    note: string | null,
  ): Promise<void> {
    await this.prisma.teamSeeker.upsert({
      where: { cycleId_userId: { cycleId, userId } },
      create: { cycleId, userId, note },
      update: { note },
    });
  }

  async remove(cycleId: string, userId: string): Promise<void> {
    await this.prisma.teamSeeker.deleteMany({ where: { cycleId, userId } });
  }

  async removeMany(
    cycleId: string,
    userIds: readonly string[],
    tx: Transaction,
  ): Promise<void> {
    await this.prisma.client(tx).teamSeeker.deleteMany({
      where: { cycleId, userId: { in: [...userIds] } },
    });
  }

  list(cycleId: string): Promise<TeamSeeker[]> {
    return this.prisma.teamSeeker.findMany({
      where: { cycleId },
      select: { userId: true, note: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
  }
}
