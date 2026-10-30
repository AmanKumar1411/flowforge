/** What happened in the student's own teams, from rows that already exist (ADR 021). */
export type UpdateKind =
  | "JOINED_TEAM"
  | "IDEA_APPROVED"
  | "IDEA_REJECTED"
  | "RESULTS_RELEASED"
  | "RESULTS_UPDATED";

export interface DashboardUpdate {
  cycleId: string;
  kind: UpdateKind;
  at: Date;
  text: string;
  /** The project tab it belongs to. */
  tab: "team" | "idea" | "milestones";
}

export interface FeedSources {
  memberships: { cycleId: string; teamName: string; addedAt: Date }[];
  reviews: {
    cycleId: string;
    version: number;
    decision: "APPROVED" | "REJECTED";
    reviewedAt: Date;
  }[];
  results: {
    cycleId: string;
    milestone: { position: number; name: string };
    releasedAt: Date;
    updatedAt: Date;
    updatedAfterRelease: boolean;
  }[];
}

export const UPDATES_LIMIT = 20;

/** Newest first, at most `UPDATES_LIMIT`. */
export function buildUpdates(sources: FeedSources): DashboardUpdate[] {
  const updates: DashboardUpdate[] = [
    ...sources.memberships.map((m) => ({
      cycleId: m.cycleId,
      kind: "JOINED_TEAM" as const,
      at: m.addedAt,
      text: `You are in team ${m.teamName}`,
      tab: "team" as const,
    })),
    ...sources.reviews.map((r) => ({
      cycleId: r.cycleId,
      kind:
        r.decision === "APPROVED"
          ? ("IDEA_APPROVED" as const)
          : ("IDEA_REJECTED" as const),
      at: r.reviewedAt,
      text: `Version ${r.version} of your idea was ${r.decision === "APPROVED" ? "approved" : "rejected, with feedback"}`,
      tab: "idea" as const,
    })),
    ...sources.results.flatMap((r) => {
      const label = `M${r.milestone.position} · ${r.milestone.name}`;
      const released = {
        cycleId: r.cycleId,
        kind: "RESULTS_RELEASED" as const,
        at: r.releasedAt,
        text: `Results for ${label} are out`,
        tab: "milestones" as const,
      };
      return r.updatedAfterRelease
        ? [
            released,
            {
              ...released,
              kind: "RESULTS_UPDATED" as const,
              at: r.updatedAt,
              text: `Your result for ${label} was updated`,
            },
          ]
        : [released];
    }),
  ];
  return updates
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, UPDATES_LIMIT);
}
