import type { ErrorDetail } from "../../common/errors/domain-error";
import type { CycleEvent, CycleStage } from "../domain/cycle-timeline";
import type { Cycle } from "../domain/cycle.types";

/** How many upcoming events a cycle view carries. */
export const NEXT_EVENTS = 3;

/** A cycle as the use cases return it: the aggregate, plus where it stands now (computed, ADR 017). */
export interface CycleView extends Cycle {
  currentStage: CycleStage;
  /** The next `NEXT_EVENTS` events, in time order. */
  nextEvents: CycleEvent[];
}

/** A published cycle, and what the publish checks warned about. */
export interface PublishedCycle extends CycleView {
  warnings: ErrorDetail[];
}

/** An upcoming event of one of a student's cycles. */
export interface StudentEvent extends CycleEvent {
  cycle: Pick<Cycle, "id" | "courseName" | "title">;
}
