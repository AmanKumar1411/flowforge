import { randomUUID } from "node:crypto";
import {
  Cycle,
  CycleCreateData,
  CyclePatch,
  CycleStatus,
  Enrollment,
} from "./cycle.types";
import { CycleRepository } from "./cycle-repository";

export class InMemoryCycleRepository extends CycleRepository {
  private readonly cycles = new Map<string, Cycle>();
  private readonly enrollments = new Map<string, Map<string, Enrollment>>();

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

  async listPublishedForStudent(
    batchYear: number | null,
    email: string,
  ): Promise<Cycle[]> {
    return [...this.cycles.values()]
      .filter(
        (cycle) =>
          cycle.status === "PUBLISHED" &&
          (cycle.kind === "ELECTIVE"
            ? this.roster(cycle.id).has(email)
            : cycle.batchYear === batchYear),
      )
      .sort(
        (a, b) =>
          (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
      );
  }

  async listPublishedOrClosed(): Promise<Cycle[]> {
    return [...this.cycles.values()]
      .filter((cycle) => cycle.status !== "DRAFT")
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

  async isEnrolled(cycleId: string, email: string): Promise<boolean> {
    return this.roster(cycleId).has(email);
  }

  async listEnrollments(cycleId: string): Promise<Enrollment[]> {
    return [...this.roster(cycleId).values()].sort((a, b) =>
      a.email.localeCompare(b.email),
    );
  }

  async addEnrollments(
    cycleId: string,
    emails: readonly string[],
  ): Promise<void> {
    const roster = this.roster(cycleId);
    for (const email of emails) {
      if (!roster.has(email))
        roster.set(email, { email, createdAt: new Date() });
    }
  }

  async removeEnrollment(cycleId: string, email: string): Promise<boolean> {
    return this.roster(cycleId).delete(email);
  }

  private roster(cycleId: string): Map<string, Enrollment> {
    let roster = this.enrollments.get(cycleId);
    if (!roster) {
      roster = new Map();
      this.enrollments.set(cycleId, roster);
    }
    return roster;
  }
}
