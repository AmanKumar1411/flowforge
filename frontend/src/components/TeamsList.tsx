import type { ReactNode } from "react";
import { Link } from "react-router";
import {
  filterTeams,
  SEARCH_FROM,
  TEAM_FILTERS,
  type TeamFilter,
  type TeamRow,
} from "../team-rows";
import type { Cycle } from "../types";
import { IdeaStatusBadge } from "./IdeaPanels";

const plural = (count: number, one: string) => `${count} ${count === 1 ? one : `${one}s`}`;

/**
 * Every team of a cycle in one list: team, leader, size, idea and its status,
 * submissions, and a link to the team's page. From 11 teams (or while a
 * filter is on) a search and a status filter appear.
 */
export function TeamsList({
  cycle,
  rows,
  error,
  query,
  filter,
  onQuery,
  onFilter,
  empty,
}: {
  cycle: Cycle;
  /** Null while loading. */
  rows: TeamRow[] | null;
  error: string;
  query: string;
  filter: TeamFilter;
  onQuery: (query: string) => void;
  onFilter: (filter: TeamFilter) => void;
  /** One line and the next step, when there is no team. */
  empty: ReactNode;
}) {
  const searching = query.trim() !== "" || filter !== "all";
  const tools = rows !== null && (rows.length >= SEARCH_FROM || searching);
  const shown = rows ? filterTeams(rows, query, filter) : [];
  return (
    <section className="team-panel teams-card" id="teams" aria-labelledby="teams-heading">
      <div className="panel-heading">
        <h2 id="teams-heading" tabIndex={-1}>
          Teams{rows && ` (${rows.length})`}
        </h2>
      </div>
      {error && <p className="form-error">{error}</p>}
      {rows === null && !error && <p className="loading">Loading teams…</p>}
      {rows?.length === 0 && <div className="teams-empty">{empty}</div>}
      {tools && (
        <div className="teams-tools" role="search" aria-label="Find a team">
          <label>
            Search
            <input
              type="search"
              value={query}
              placeholder="Team, student or idea"
              onChange={(event) => onQuery(event.target.value)}
            />
          </label>
          <label>
            Idea status
            <select value={filter} onChange={(event) => onFilter(event.target.value as TeamFilter)}>
              {TEAM_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {tools && (
        <p className="field-hint" role="status">
          {searching ? `Showing ${shown.length} of ${plural(rows.length, "team")}.` : ""}
          {searching && shown.length === 0 && (
            <>
              {" "}
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  onQuery("");
                  onFilter("all");
                }}
              >
                Show all teams
              </button>
            </>
          )}
        </p>
      )}
      {shown.length > 0 && (
        <ul className="team-rows">
          {shown.map((row) => (
            <li key={row.id} className="team-row">
              <div className="team-row-team">
                <strong>{row.name}</strong>
                <span>Led by {row.leader}</span>
              </div>
              <span className="team-row-size">
                {row.members}/{cycle.maxTeamSize} members
              </span>
              <div className="team-row-idea">
                {row.idea ? (
                  <>
                    <span>{row.idea.title}</span>
                    <IdeaStatusBadge idea={row.idea} />
                  </>
                ) : (
                  <span className="muted">No idea yet</span>
                )}
              </div>
              <span className="team-row-work">
                {row.submissions === 0 ? "No submissions" : plural(row.submissions, "submission")}
              </span>
              <Link
                className="text-button team-row-link"
                to={`/faculty/cycles/${cycle.id}/teams/${row.id}`}
                aria-label={`View details of ${row.name}`}
              >
                View details
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
