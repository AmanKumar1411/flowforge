import { Cycle, CycleCreateData, CyclePatch, CycleStatus } from "./cycle.types";

export abstract class CycleRepository {
  abstract create(data: CycleCreateData): Promise<Cycle>;
  abstract findById(id: string): Promise<Cycle | null>;
  abstract listByOwner(ownerId: string): Promise<Cycle[]>;
  abstract listPublishedForBatch(batchYear: number): Promise<Cycle[]>;
  abstract listPublishedOrClosed(): Promise<Cycle[]>;
  abstract updateFields(
    id: string,
    expectedStatus: CycleStatus,
    fields: CyclePatch,
  ): Promise<Cycle | null>;
  abstract transitionStatus(
    id: string,
    expectedStatus: CycleStatus,
    nextStatus: CycleStatus,
    timestamp: Date,
  ): Promise<Cycle | null>;
}
