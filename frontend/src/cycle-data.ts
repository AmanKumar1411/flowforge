import { useEffect, useState } from "react";
import { listBatchStudents, listEnrollments } from "./api/cycles";
import { listCatalog, listCycleIdeas } from "./api/ideas";
import { listCycleSubmissions } from "./api/submissions";
import { getCompletionOverview, listCycleTeams } from "./api/teams";
import type { CycleCounts, SectionKey } from "./cycle-page";
import type {
  CatalogIdea,
  CompletionOverview,
  Cycle,
  CycleIdea,
  CycleSubmission,
  Team,
} from "./types";

/** What the faculty's cycle page shows, each part undefined until it loads. */
export interface CycleData {
  roster?: { signedIn: boolean }[];
  catalog?: CatalogIdea[];
  teams?: Team[];
  ideas?: CycleIdea[];
  /** Each milestone's rows, in milestone order. */
  milestoneWork?: { milestoneId: string; rows: CycleSubmission[] }[];
  /** Every milestone's rows together, for the teams list. */
  submissions?: CycleSubmission[];
  overview?: CompletionOverview;
  /** Parts that could not be loaded, by the summary they feed. */
  failed: Partial<Record<SectionKey, true>>;
}

/** Loads a cycle's parts for its faculty; a new `version` loads them again after a change. */
export function useCycleData(cycle: Cycle | null, version: number): CycleData {
  const [data, setData] = useState<CycleData>({ failed: {} });
  useEffect(() => {
    if (!cycle) return;
    let live = true;
    const merge = (part: Partial<CycleData>) =>
      live &&
      setData((current) => ({
        ...current,
        ...part,
        failed: { ...current.failed, ...part.failed },
      }));
    const fail = (...sections: SectionKey[]) => () =>
      merge({ failed: Object.fromEntries(sections.map((key) => [key, true])) });
    const roster: Promise<{ signedIn: boolean }[]> =
      cycle.kind === "ELECTIVE" ? listEnrollments(cycle.id) : listBatchStudents(cycle.id);
    roster.then((list) => merge({ roster: list })).catch(fail("students"));
    listCatalog(cycle.id)
      .then((catalog) => merge({ catalog }))
      .catch(fail("catalog"));
    // A draft has no teams yet.
    if (cycle.status === "DRAFT") {
      merge({ teams: [], ideas: [], submissions: [], milestoneWork: [] });
    } else {
      listCycleTeams(cycle.id)
        .then((teams) => merge({ teams }))
        .catch(fail("teams"));
      listCycleIdeas(cycle.id)
        .then((ideas) => merge({ ideas }))
        .catch(fail("teams", "ideas"));
      Promise.all(
        cycle.milestones.map((milestone) =>
          listCycleSubmissions(cycle.id, milestone.id).then((rows) => ({ milestoneId: milestone.id, rows })),
        ),
      )
        .then((milestoneWork) =>
          merge({ milestoneWork, submissions: milestoneWork.flatMap((work) => work.rows) }),
        )
        .catch(fail("submissions"));
      getCompletionOverview(cycle.id)
        .then((overview) => merge({ overview }))
        .catch(fail("teams"));
    }
    return () => {
      live = false;
    };
  }, [cycle, version]);
  return data;
}

/** The counts the summaries, the primary action and the attention card use. */
export function countsOf(data: CycleData, cycle?: Cycle, now = Date.now()): CycleCounts {
  const { roster, catalog, teams, ideas, milestoneWork, overview } = data;
  const ideaCount = (status: string | null) =>
    ideas?.filter((row) => (row.idea?.status ?? null) === status).length ?? 0;
  return {
    roster: roster && {
      total: roster.length,
      notSignedIn: roster.filter((student) => !student.signedIn).length,
    },
    catalog: catalog && {
      offered: catalog.length,
      picked: catalog.reduce((sum, idea) => sum + idea.pickCount, 0),
    },
    teams: teams?.length,
    unplaced: overview?.unassigned.length,
    ideas: ideas && {
      waiting: ideaCount("SUBMITTED"),
      approved: ideaCount("APPROVED"),
      rejected: ideaCount("REJECTED"),
      none: ideaCount(null),
    },
    // Milestones open now, and how many teams have handed something in for each.
    openMilestones:
      cycle && milestoneWork
        ? cycle.milestones
            .filter(
              (milestone) =>
                Date.parse(milestone.submissionOpensAt) <= now && now < Date.parse(milestone.submissionDueAt),
            )
            .map((milestone) => {
              const rows = milestoneWork.find((work) => work.milestoneId === milestone.id)?.rows ?? [];
              return { milestone, submitted: rows.filter((row) => row.latest).length, teams: rows.length };
            })
        : undefined,
    failed: data.failed,
  };
}
