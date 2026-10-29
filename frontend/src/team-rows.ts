import type { CycleIdea, CycleSubmission, IdeaSource, IdeaStatus, Team } from "./types";

/**
 * One row per team for the faculty's teams list, joined from the cycle's
 * teams, ideas and submissions (three read calls the page already makes).
 */
export interface TeamRow {
  id: string;
  name: string;
  leader: string;
  /** Everyone's name, for the search. */
  memberNames: string[];
  members: number;
  idea: { title: string; status: IdeaStatus; source: IdeaSource } | null;
  /** Versions of work submitted. */
  submissions: number;
}

export type TeamFilter = "all" | "waiting" | "approved" | "rejected" | "none";

export const TEAM_FILTERS: { value: TeamFilter; label: string }[] = [
  { value: "all", label: "All teams" },
  { value: "waiting", label: "Waiting for review" },
  { value: "approved", label: "Approved or picked" },
  { value: "rejected", label: "Rejected" },
  { value: "none", label: "No idea yet" },
];

/** The list shows a search and a status filter from this many teams. */
export const SEARCH_FROM = 11;

export function teamRows(
  teams: Team[],
  ideas: CycleIdea[],
  submissions: CycleSubmission[],
): TeamRow[] {
  const ideaOf = new Map(ideas.map((row) => [row.team.id, row.idea]));
  const versionsOf = new Map(submissions.map((row) => [row.team.id, row.versionCount]));
  return teams
    .map((team) => {
      const idea = ideaOf.get(team.id) ?? null;
      return {
        id: team.id,
        name: team.name,
        leader: team.members.find((member) => member.isLeader)?.name ?? "",
        memberNames: team.members.map((member) => member.name),
        members: team.members.length,
        idea: idea && { title: idea.title, status: idea.status, source: idea.source },
        submissions: versionsOf.get(team.id) ?? 0,
      };
    })
    .sort(
      (a, b) =>
        Number(b.idea?.status === "SUBMITTED") - Number(a.idea?.status === "SUBMITTED") ||
        a.name.localeCompare(b.name),
    );
}

function matchesFilter(row: TeamRow, filter: TeamFilter) {
  switch (filter) {
    case "all":
      return true;
    case "waiting":
      return row.idea?.status === "SUBMITTED";
    case "approved":
      return row.idea?.status === "APPROVED";
    case "rejected":
      return row.idea?.status === "REJECTED";
    case "none":
      return row.idea === null;
  }
}

/** Rows whose team, leader, member or idea matches the search, with the chosen status. */
export function filterTeams(rows: TeamRow[], query: string, filter: TeamFilter) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((row) => {
    if (!matchesFilter(row, filter)) return false;
    const text = [row.name, ...row.memberNames, row.idea?.title ?? ""].join(" ").toLowerCase();
    return words.every((word) => text.includes(word));
  });
}
