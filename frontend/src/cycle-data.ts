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
      merge({ teams: [], ideas: [], submissions: [] });
    } else {
      listCycleTeams(cycle.id)
        .then((teams) => merge({ teams }))
        .catch(fail("teams"));
      listCycleIdeas(cycle.id)
        .then((ideas) => merge({ ideas }))
        .catch(fail("teams", "ideas"));
      listCycleSubmissions(cycle.id)
        .then((submissions) => merge({ submissions }))
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
export function countsOf(data: CycleData): CycleCounts {
  const { roster, catalog, teams, ideas, submissions, overview } = data;
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
    submissions: submissions && {
      submitted: submissions.filter((row) => row.latest).length,
    },
    failed: data.failed,
  };
}
