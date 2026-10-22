import { randomUUID } from "node:crypto";
import { Cycle, CycleCreateData, CyclePatch, CycleStatus } from "./cycle.types";
import { CycleRepository } from "./cycle-repository";

export class InMemoryCycleRepository extends CycleRepository {
  private readonly cycles = new Map<string, Cycle>();

  async create(data: CycleCreateData): Promise<Cycle> {
    const now = new Date();
    const cycle: Cycle = {
      ...data,
      id: randomUUID(),
      status: "DRAFT",
      publishedAt: null,
      closedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.cycles.set(cycle.id, cycle);
    return cycle;
  }

  async findById(id: string): Promise<Cycle | null> {
    return this.cycles.get(id) ?? null;
  }

  async listByOwner(ownerId: string): Promise<Cycle[]> {
    return [...this.cycles.values()]
      .filter((cycle) => cycle.createdByFacultyId === ownerId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async listPublishedForBatch(batchYear: number): Promise<Cycle[]> {
    return [...this.cycles.values()]
      .filter(
        (cycle) =>
          cycle.status === "PUBLISHED" && cycle.batchYear === batchYear,
      )
      .sort(
        (a, b) =>
          (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
      );
  }

  async updateFields(
    id: string,
    expectedStatus: CycleStatus,
    fields: CyclePatch,
  ): Promise<Cycle | null> {
    const cycle = this.cycles.get(id);
    if (!cycle || cycle.status !== expectedStatus) {
      return null;
    }
    const updated = { ...cycle, ...fields, updatedAt: new Date() };
    this.cycles.set(id, updated);
    return updated;
  }

  async transitionStatus(
    id: string,
    expectedStatus: CycleStatus,
    nextStatus: CycleStatus,
    timestamp: Date,
  ): Promise<Cycle | null> {
    const cycle = this.cycles.get(id);
    if (!cycle || cycle.status !== expectedStatus) {
      return null;
    }
    const updated: Cycle = {
      ...cycle,
      status: nextStatus,
      publishedAt: nextStatus === "PUBLISHED" ? timestamp : cycle.publishedAt,
      closedAt: nextStatus === "CLOSED" ? timestamp : cycle.closedAt,
      updatedAt: timestamp,
    };
    this.cycles.set(id, updated);
    return updated;
  }
}
