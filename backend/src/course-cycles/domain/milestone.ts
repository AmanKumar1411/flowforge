import { LinkRequirement } from "../../common/links/link-requirement";

/** A cycle has 1 to 10 milestones once published (a draft may have none yet). */
export const MAX_MILESTONES = 10;

/**
 * One checkpoint of a cycle (M1…Mn): the window in which teams hand in a
 * version of their work, and the day it is evaluated. Part of the cycle
 * aggregate: saved, locked and published with its cycle. It holds dates and
 * details only, so a later `Evaluation` can reference it (by `id` and
 * `cycleId`) without changing it.
 */
export interface Milestone {
  id: string;
  cycleId: string;
  /** 1…n, in the order the milestones happen. */
  position: number;
  name: string;
  description: string | null;
  submissionOpensAt: Date;
  /** Versions are accepted strictly before this moment. */
  submissionDueAt: Date;
  evaluationAt: Date;
  linkRequirement: LinkRequirement;
  createdAt: Date;
  updatedAt: Date;
}

/** A milestone as the faculty write it. `id` names one that exists already; its place in the list sets its position. */
export interface MilestoneInput {
  id?: string;
  name: string;
  description: string | null;
  submissionOpensAt: Date;
  submissionDueAt: Date;
  evaluationAt: Date;
  linkRequirement: LinkRequirement;
}

export type PlacedMilestone = Omit<MilestoneInput, "id"> & { position: number };

/** How saving a list of milestones changes the stored ones. Ids stay stable, because submissions reference them. */
export interface MilestonePlan {
  create: PlacedMilestone[];
  update: (PlacedMilestone & { id: string })[];
  remove: string[];
}

/** "M2 · Design review" */
export const milestoneLabel = (position: number, name: string): string =>
  `M${position} · ${name}`;

/** Submissions for it have opened (and the window may be over). */
export const hasOpened = (
  milestone: Pick<Milestone, "submissionOpensAt">,
  now: Date,
): boolean => milestone.submissionOpensAt <= now;

/** Trimmed text; an empty description means none. */
export const cleanMilestone = (input: MilestoneInput): MilestoneInput => ({
  ...input,
  name: input.name.trim(),
  description: input.description?.trim() || null,
});

/**
 * Compares the requested list with the stored milestones. An `id` that is
 * not one of the cycle's milestones is refused by the caller first
 * (`unknownIds`).
 */
export function planMilestones(
  current: readonly Pick<Milestone, "id">[],
  next: readonly MilestoneInput[],
): MilestonePlan {
  const kept = new Set(next.flatMap((input) => (input.id ? [input.id] : [])));
  const plan: MilestonePlan = {
    create: [],
    update: [],
    remove: current.filter((m) => !kept.has(m.id)).map((m) => m.id),
  };
  next.forEach(({ id, ...fields }, index) => {
    const placed = { ...fields, position: index + 1 };
    if (id) plan.update.push({ ...placed, id });
    else plan.create.push(placed);
  });
  return plan;
}

/** Ids in the request that are not the cycle's milestones, or that appear twice. */
export function unknownIds(
  current: readonly Pick<Milestone, "id">[],
  next: readonly MilestoneInput[],
): string[] {
  const known = new Set(current.map((m) => m.id));
  const seen = new Set<string>();
  const bad: string[] = [];
  for (const { id } of next) {
    if (!id) continue;
    if (!known.has(id) || seen.has(id)) bad.push(id);
    seen.add(id);
  }
  return bad;
}
