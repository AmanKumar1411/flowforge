import { Injectable } from "@nestjs/common";
import { LinkRequirement } from "../../common/links/link-requirement";
import { Transaction } from "../../common/transaction";
import {
  CycleStatus as PrismaCycleStatus,
  Prisma,
} from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CycleRepository } from "../application/ports/cycle.repository";
import {
  Cycle,
  CycleCreateData,
  CyclePatch,
  CycleStatus,
  Enrollment,
} from "../domain/cycle.types";
import { Milestone, MilestonePlan, PlacedMilestone } from "../domain/milestone";

const withMilestones = {
  milestones: { orderBy: { position: "asc" } },
} satisfies Prisma.CourseProjectCycleInclude;

type CycleRow = Prisma.CourseProjectCycleGetPayload<{
  include: typeof withMilestones;
}>;

const toMilestone = (row: CycleRow["milestones"][number]): Milestone => ({
  ...row,
  linkRequirement: LinkRequirement.from(row.linkRequirement),
});

const toDomain = (row: CycleRow): Cycle => ({
  ...row,
  status: row.status as CycleStatus,
  ideaLinkRequirement: LinkRequirement.from(row.ideaLinkRequirement),
  milestones: row.milestones.map(toMilestone),
});

const milestoneData = (milestone: PlacedMilestone) => ({
  ...milestone,
  linkRequirement: milestone.linkRequirement.toJSON() as object,
});

const fieldData = (
  fields: CyclePatch,
): Prisma.CourseProjectCycleUpdateManyMutationInput => {
  const { ideaLinkRequirement, ...rest } = fields;
  return {
    ...rest,
    ...(ideaLinkRequirement
      ? { ideaLinkRequirement: ideaLinkRequirement.toJSON() as object }
      : {}),
  };
};

// Positions move out of the way first, so a reordered list never collides with itself.
const POSITION_OFFSET = 1000;

@Injectable()
export class PrismaCycleRepository extends CycleRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(
    data: CycleCreateData,
    milestones: readonly PlacedMilestone[],
    tx: Transaction,
  ): Promise<Cycle> {
    const row = await this.prisma.client(tx).courseProjectCycle.create({
      data: {
        ...data,
        ideaLinkRequirement: data.ideaLinkRequirement.toJSON() as object,
        milestones: { create: milestones.map(milestoneData) },
      },
      include: withMilestones,
    });
    return toDomain(row);
  }

  async findById(id: string, tx?: Transaction): Promise<Cycle | null> {
    const row = await this.prisma.client(tx).courseProjectCycle.findUnique({
      where: { id },
      include: withMilestones,
    });
    return row ? toDomain(row) : null;
  }

  async lockById(id: string, tx: Transaction): Promise<Cycle | null> {
    await this.prisma.client(tx)
      .$queryRaw`SELECT "id" FROM "CourseProjectCycle" WHERE "id" = ${id} FOR UPDATE`;
    return this.findById(id, tx);
  }

  async listByOwner(ownerId: string): Promise<Cycle[]> {
    const rows = await this.prisma.courseProjectCycle.findMany({
      where: { createdByFacultyId: ownerId },
      include: withMilestones,
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toDomain);
  }

  async listPublishedForStudent(
    batchYear: number | null,
    email: string,
  ): Promise<Cycle[]> {
    const electives: Prisma.CourseProjectCycleWhereInput = {
      kind: "ELECTIVE",
      enrollments: { some: { email } },
    };
    const rows = await this.prisma.courseProjectCycle.findMany({
      where: {
        status: PrismaCycleStatus.PUBLISHED,
        OR:
          batchYear === null
            ? [electives]
            : [{ kind: "CORE", batchYear }, electives],
      },
      include: withMilestones,
      orderBy: { publishedAt: "desc" },
    });
    return rows.map(toDomain);
  }

  async listPublishedOrClosed(): Promise<Cycle[]> {
    const rows = await this.prisma.courseProjectCycle.findMany({
      where: {
        status: { in: [PrismaCycleStatus.PUBLISHED, PrismaCycleStatus.CLOSED] },
      },
      include: withMilestones,
      orderBy: { publishedAt: "desc" },
    });
    return rows.map(toDomain);
  }

  async listClosedByIds(ids: readonly string[]): Promise<Cycle[]> {
    const rows = await this.prisma.courseProjectCycle.findMany({
      where: { id: { in: [...ids] }, status: PrismaCycleStatus.CLOSED },
      include: withMilestones,
      orderBy: { closedAt: "desc" },
    });
    return rows.map(toDomain);
  }

  async update(
    id: string,
    expectedStatus: CycleStatus,
    fields: CyclePatch,
    milestones: MilestonePlan | null,
    tx: Transaction,
  ): Promise<Cycle | null> {
    const client = this.prisma.client(tx);
    const { count } = await client.courseProjectCycle.updateMany({
      where: { id, status: expectedStatus as PrismaCycleStatus },
      // updatedAt also moves when only the milestones change.
      data: { ...fieldData(fields), updatedAt: new Date() },
    });
    if (count === 0) return null;
    if (milestones) {
      await client.milestone.deleteMany({
        where: { cycleId: id, id: { in: milestones.remove } },
      });
      await client.$executeRaw`UPDATE "Milestone" SET "position" = "position" + ${POSITION_OFFSET} WHERE "cycleId" = ${id}`;
      for (const { id: milestoneId, ...milestone } of milestones.update) {
        await client.milestone.update({
          where: { id: milestoneId },
          data: milestoneData(milestone),
        });
      }
      await client.milestone.createMany({
        data: milestones.create.map((milestone) => ({
          ...milestoneData(milestone),
          cycleId: id,
        })),
      });
    }
    return this.findById(id, tx);
  }

  async transitionStatus(
    id: string,
    expectedStatus: CycleStatus,
    nextStatus: CycleStatus,
    timestamp: Date,
    tx: Transaction,
  ): Promise<Cycle | null> {
    const data: Prisma.CourseProjectCycleUpdateManyMutationInput = {
      status: nextStatus as PrismaCycleStatus,
      publishedAt: nextStatus === "PUBLISHED" ? timestamp : undefined,
      closedAt: nextStatus === "CLOSED" ? timestamp : undefined,
    };
    const result = await this.prisma.client(tx).courseProjectCycle.updateMany({
      where: { id, status: expectedStatus as PrismaCycleStatus },
      data,
    });
    if (result.count === 0) {
      return null;
    }
    return this.findById(id, tx);
  }

  async isEnrolled(cycleId: string, email: string): Promise<boolean> {
    const row = await this.prisma.cycleEnrollment.findUnique({
      where: { cycleId_email: { cycleId, email } },
      select: { email: true },
    });
    return row !== null;
  }

  listEnrollments(cycleId: string, tx?: Transaction): Promise<Enrollment[]> {
    return this.prisma.client(tx).cycleEnrollment.findMany({
      where: { cycleId },
      select: { email: true, createdAt: true },
      orderBy: { email: "asc" },
    });
  }

  async addEnrollments(
    cycleId: string,
    emails: readonly string[],
    addedById: string,
    tx: Transaction,
  ): Promise<void> {
    await this.prisma.client(tx).cycleEnrollment.createMany({
      data: emails.map((email) => ({ cycleId, email, addedById })),
      skipDuplicates: true,
    });
  }

  async removeEnrollment(
    cycleId: string,
    email: string,
    tx: Transaction,
  ): Promise<boolean> {
    const { count } = await this.prisma.client(tx).cycleEnrollment.deleteMany({
      where: { cycleId, email },
    });
    return count > 0;
  }
}
