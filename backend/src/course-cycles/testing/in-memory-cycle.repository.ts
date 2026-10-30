import { randomUUID } from "node:crypto";
import {
  Cycle,
  CycleCreateData,
  CyclePatch,
  CycleStatus,
  Enrollment,
} from "../domain/cycle.types";
import { Milestone, MilestonePlan, PlacedMilestone } from "../domain/milestone";
import { CycleRepository } from "../application/ports/cycle.repository";

export class InMemoryCycleRepository extends CycleRepository {
  private readonly cycles = new Map<string, Cycle>();
  private readonly enrollments = new Map<string, Map<string, Enrollment>>();

  async create(
    data: CycleCreateData,
    milestones: readonly PlacedMilestone[],
  ): Promise<Cycle> {
    const now = new Date();
    const id = randomUUID();
    const cycle: Cycle = {
      ...data,
      id,
      milestones: milestones.map((milestone) => this.milestone(id, milestone)),
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

  async listClosedByIds(ids: readonly string[]): Promise<Cycle[]> {
    return [...this.cycles.values()]
      .filter((cycle) => ids.includes(cycle.id) && cycle.status === "CLOSED")
      .sort(
        (a, b) => (b.closedAt?.getTime() ?? 0) - (a.closedAt?.getTime() ?? 0),
      );
  }

  async lockById(id: string): Promise<Cycle | null> {
    return this.findById(id);
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

  async update(
    id: string,
    expectedStatus: CycleStatus,
    fields: CyclePatch,
    plan: MilestonePlan | null,
  ): Promise<Cycle | null> {
    const cycle = this.cycles.get(id);
    if (!cycle || cycle.status !== expectedStatus) {
      return null;
    }
    let milestones = cycle.milestones;
    if (plan) {
      const byId = new Map(cycle.milestones.map((m) => [m.id, m]));
      milestones = [
        ...plan.update.map((m) => ({
          ...byId.get(m.id)!,
          ...m,
          updatedAt: new Date(),
        })),
        ...plan.create.map((m) => this.milestone(id, m)),
      ].sort((a, b) => a.position - b.position);
    }
    const updated = { ...cycle, ...fields, milestones, updatedAt: new Date() };
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

  private milestone(cycleId: string, placed: PlacedMilestone): Milestone {
    const now = new Date();
    return {
      ...placed,
      id: randomUUID(),
      cycleId,
      createdAt: now,
      updatedAt: now,
    };
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
