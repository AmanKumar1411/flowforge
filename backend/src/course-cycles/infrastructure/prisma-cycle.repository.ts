import { Injectable } from "@nestjs/common";
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

  async listPublishedForBatch(batchYear: number): Promise<Cycle[]> {
    const cycles = await this.prisma.courseProjectCycle.findMany({
      where: { batchYear, status: PrismaCycleStatus.PUBLISHED },
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
}
