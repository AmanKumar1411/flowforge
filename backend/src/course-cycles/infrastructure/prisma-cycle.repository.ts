import { Injectable } from "@nestjs/common";
import { Transaction } from "../../common/transaction";
import {
  CourseProjectCycle as PrismaCycle,
  CycleStatus as PrismaCycleStatus,
  Prisma,
} from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  Cycle,
  CycleCreateData,
  CyclePatch,
  CycleStatus,
  Enrollment,
} from "../domain/cycle.types";
import { CycleRepository } from "../domain/cycle-repository";

const toDomainStatus = (status: PrismaCycleStatus): CycleStatus => status;

const toDomain = (cycle: PrismaCycle): Cycle => ({
  ...cycle,
  status: toDomainStatus(cycle.status),
});

@Injectable()
export class PrismaCycleRepository extends CycleRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(data: CycleCreateData): Promise<Cycle> {
    const cycle = await this.prisma.courseProjectCycle.create({ data });
    return toDomain(cycle);
  }

  async findById(id: string): Promise<Cycle | null> {
    const cycle = await this.prisma.courseProjectCycle.findUnique({
      where: { id },
    });
    return cycle ? toDomain(cycle) : null;
  }

  async listByOwner(ownerId: string): Promise<Cycle[]> {
    const cycles = await this.prisma.courseProjectCycle.findMany({
      where: { createdByFacultyId: ownerId },
      orderBy: { createdAt: "desc" },
    });
    return cycles.map(toDomain);
  }

  async listPublishedForStudent(
    batchYear: number | null,
    email: string,
  ): Promise<Cycle[]> {
    const electives: Prisma.CourseProjectCycleWhereInput = {
      kind: "ELECTIVE",
      enrollments: { some: { email } },
    };
    const cycles = await this.prisma.courseProjectCycle.findMany({
      where: {
        status: PrismaCycleStatus.PUBLISHED,
        OR:
          batchYear === null
            ? [electives]
            : [{ kind: "CORE", batchYear }, electives],
      },
      orderBy: { publishedAt: "desc" },
    });
    return cycles.map(toDomain);
  }

  async listPublishedOrClosed(): Promise<Cycle[]> {
    const cycles = await this.prisma.courseProjectCycle.findMany({
      where: {
        status: { in: [PrismaCycleStatus.PUBLISHED, PrismaCycleStatus.CLOSED] },
      },
      orderBy: { publishedAt: "desc" },
    });
    return cycles.map(toDomain);
  }

  async updateFields(
    id: string,
    expectedStatus: CycleStatus,
    fields: CyclePatch,
  ): Promise<Cycle | null> {
    const result = await this.prisma.courseProjectCycle.updateMany({
      where: { id, status: expectedStatus as PrismaCycleStatus },
      data: fields as Prisma.CourseProjectCycleUpdateManyMutationInput,
    });
    if (result.count === 0) {
      return null;
    }
    return this.findById(id);
  }

  async transitionStatus(
    id: string,
    expectedStatus: CycleStatus,
    nextStatus: CycleStatus,
    timestamp: Date,
  ): Promise<Cycle | null> {
    const data: Prisma.CourseProjectCycleUpdateManyMutationInput = {
      status: nextStatus as PrismaCycleStatus,
      publishedAt: nextStatus === "PUBLISHED" ? timestamp : undefined,
      closedAt: nextStatus === "CLOSED" ? timestamp : undefined,
    };
    const result = await this.prisma.courseProjectCycle.updateMany({
      where: { id, status: expectedStatus as PrismaCycleStatus },
      data,
    });
    if (result.count === 0) {
      return null;
    }
    return this.findById(id);
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
