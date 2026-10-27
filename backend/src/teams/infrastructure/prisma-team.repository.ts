import { Injectable } from "@nestjs/common";
import { Transaction } from "../../common/transaction";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { TeamRepository } from "../application/ports/team.repository";
import { TeamDomainError } from "../domain/team.errors";
import { Membership, NewTeam, Team, TeamChange } from "../domain/team";

// Member names and emails are read through the relation in the same query, not one lookup per member.
const withMembers = {
  members: {
    include: { user: { select: { name: true, email: true } } },
    orderBy: { addedAt: "asc" },
  },
} satisfies Prisma.TeamInclude;

type TeamRow = Prisma.TeamGetPayload<{ include: typeof withMembers }>;

const toDomain = (row: TeamRow): Team => ({
  id: row.id,
  cycleId: row.cycleId,
  name: row.name,
  leaderId: row.leaderId,
  origin: row.origin,
  members: row.members.map((member) => ({
    userId: member.userId,
    name: member.user.name,
    email: member.user.email,
    addedById: member.addedById,
    addedAt: member.addedAt,
  })),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002";

@Injectable()
export class PrismaTeamRepository extends TeamRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string): Promise<Team | null> {
    const row = await this.prisma.team.findUnique({
      where: { id },
      include: withMembers,
    });
    return row ? toDomain(row) : null;
  }

  async findByIdForUpdate(id: string, tx: Transaction): Promise<Team | null> {
    const client = this.prisma.client(tx);
    await client.$queryRaw`SELECT "id" FROM "Team" WHERE "id" = ${id} FOR UPDATE`;
    const row = await client.team.findUnique({
      where: { id },
      include: withMembers,
    });
    return row ? toDomain(row) : null;
  }

  async findByMember(cycleId: string, userId: string): Promise<Team | null> {
    const row = await this.prisma.team.findFirst({
      where: { cycleId, members: { some: { userId } } },
      include: withMembers,
    });
    return row ? toDomain(row) : null;
  }

  async listByCycle(cycleId: string): Promise<Team[]> {
    const rows = await this.prisma.team.findMany({
      where: { cycleId },
      include: withMembers,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map(toDomain);
  }

  async listByMember(userId: string): Promise<Team[]> {
    const rows = await this.prisma.team.findMany({
      where: { members: { some: { userId } } },
      include: withMembers,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    });
    return rows.map(toDomain);
  }

  findMemberships(
    cycleId: string,
    userIds: readonly string[],
    tx?: Transaction,
  ): Promise<Membership[]> {
    return this.prisma.client(tx).teamMember.findMany({
      where: { cycleId, userId: { in: [...userIds] } },
      select: { userId: true, teamId: true },
    });
  }

  async findMembershipByEmail(
    cycleId: string,
    email: string,
    tx: Transaction,
  ): Promise<Membership | null> {
    return this.prisma.client(tx).teamMember.findFirst({
      where: { cycleId, user: { email } },
      select: { userId: true, teamId: true },
    });
  }

  async create(team: NewTeam, tx: Transaction): Promise<Team> {
    return this.mapConflict(async () =>
      toDomain(
        await this.prisma.client(tx).team.create({
          data: {
            cycleId: team.cycleId,
            name: team.name,
            leaderId: team.leaderId,
            origin: team.origin,
            // Nested rows take teamId and cycleId from the team, so they cannot point at another cycle.
            members: {
              createMany: {
                data: [team.leaderId, ...team.memberIds].map((userId) => ({
                  userId,
                  addedById: team.addedById,
                })),
              },
            },
          },
          include: withMembers,
        }),
      ),
    );
  }

  async update(id: string, change: TeamChange, tx: Transaction): Promise<Team> {
    return this.mapConflict(async () =>
      toDomain(
        await this.prisma.client(tx).team.update({
          where: { id },
          data: {
            name: change.name,
            // Set explicitly: a change to members alone would not touch the team row.
            updatedAt: new Date(),
            members: {
              deleteMany: { userId: { in: [...change.removeMemberIds] } },
              createMany: {
                data: change.addMemberIds.map((userId) => ({
                  userId,
                  addedById: change.addedById,
                })),
              },
            },
          },
          include: withMembers,
        }),
      ),
    );
  }

  async delete(id: string, tx: Transaction): Promise<void> {
    // Member rows go with it (ON DELETE CASCADE).
    await this.prisma.client(tx).team.delete({ where: { id } });
  }

  private async mapConflict<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new TeamDomainError(
          "STUDENT_ALREADY_IN_TEAM",
          "A selected student joined another team a moment ago; search again",
        );
      }
      throw error;
    }
  }
}
