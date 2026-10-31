import { useState } from "react";
import { Link } from "react-router";
import { listTeamSubmissions } from "../api/submissions";
import { formatDate } from "../dates";
import { readableError } from "../errors";
import { focusTarget } from "../focus";
import { submissionWindow } from "../ideas";
import { requirementText } from "../links";
import type { Cycle, CycleSubmission, Submission } from "../types";
import { GradingPanel } from "./faculty/GradingPanel";
import { SubmissionHistory } from "./SubmissionPanels";

const WINDOW_TEXT = { NOT_OPEN: "Coming up", OPEN: "Open now", CLOSED: "Closed" } as const;

/**
 * The faculty's Milestones tab: one card per milestone with every team's
 * work for it, the latest version first and the others a click away.
 */
export function MilestonesTab({
  cycle,
  work,
  failed,
  now,
  onChanged,
}: {
  cycle: Cycle;
  /** Each milestone's rows; undefined while loading. */
  work: { milestoneId: string; rows: CycleSubmission[] }[] | undefined;
  failed: boolean;
  now: number;
  /** Told after a grading change, so the page's counts follow. */
  onChanged?: () => void;
}) {
  if (cycle.milestones.length === 0) {
    return <p className="muted">No milestones yet. Add them in the project's setup.</p>;
  }
  const gradable = cycle.status !== "DRAFT";
  return (
    <div className="milestone-list">
      {gradable && (
        <nav className="jump-links" aria-label="Grading">
          {cycle.milestones.map((milestone) => (
            <a
              key={milestone.id}
              href={`#grading-${milestone.id}`}
              onClick={(event) => focusTarget(event, `grading-${milestone.id}`)}
            >
              Jump to grading of M{milestone.position}
            </a>
          ))}
        </nav>
      )}
      {cycle.milestones.map((milestone) => {
        const rows = work?.find((entry) => entry.milestoneId === milestone.id)?.rows;
        const stage = submissionWindow(cycle, milestone, now);
        const submitted = rows?.filter((row) => row.latest).length ?? 0;
        const headingId = `milestone-${milestone.id}`;
        return (
          <section key={milestone.id} className={`team-panel milestone-card is-${stage.toLowerCase()}`} aria-labelledby={headingId}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">
                  M{milestone.position} · {WINDOW_TEXT[stage]}
                </p>
                <h2 id={headingId}>{milestone.name}</h2>
              </div>
              {rows && rows.length > 0 && (
                <span className="field-hint">
                  {submitted} of {rows.length} {rows.length === 1 ? "team" : "teams"} submitted
                </span>
              )}
            </div>
            {milestone.description && <p>{milestone.description}</p>}
            <p className="field-hint">
              Opens {formatDate(milestone.submissionOpensAt)} · due {formatDate(milestone.submissionDueAt)} · evaluated{" "}
              {formatDate(milestone.evaluationAt)}
            </p>
            <p className="field-hint">Links: {requirementText(milestone.linkRequirement)}</p>
            {failed ? (
              <p className="form-error">Couldn't load the submissions. Reload the page to try again.</p>
            ) : !rows ? (
              <p className="loading">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="muted">No teams yet.</p>
            ) : (
              <ul className="milestone-teams" aria-label={`Teams' work for M${milestone.position}`}>
                {rows.map((row) => (
                  <li key={row.team.id}>
                    <div className="milestone-team-head">
                      <Link to={`/faculty/cycles/${cycle.id}/teams/${row.team.id}`}>{row.team.name}</Link>
                      <span className="field-hint">
                        {row.latest
                          ? `Version ${row.latest.version} · ${row.latest.submittedBy.name} · ${formatDate(row.latest.submittedAt)}`
                          : stage === "CLOSED"
                            ? "Submitted nothing"
                            : "Nothing yet"}
                      </span>
                    </div>
                    {row.versionCount > 0 && (
                      <TeamHistory
                        teamId={row.team.id}
                        milestoneId={milestone.id}
                        versionCount={row.versionCount}
                        latestLabel={stage === "CLOSED" ? "Final" : "Latest"}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
            {gradable && <GradingPanel cycle={cycle} milestone={milestone} onChanged={onChanged} />}
          </section>
        );
      })}
    </div>
  );
}

const HISTORY_PAGE = 10;

/** A team's versions, read when the faculty open them, ten at a time (H4). */
export function TeamHistory({
  teamId,
  milestoneId,
  versionCount,
  latestLabel,
}: {
  teamId: string;
  milestoneId: string;
  versionCount: number;
  latestLabel: string;
}) {
  const [versions, setVersions] = useState<Submission[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const loadMore = async () => {
    setLoading(true);
    setError("");
    try {
      const before = versions?.at(-1)?.version;
      const page = await listTeamSubmissions(teamId, milestoneId, { limit: HISTORY_PAGE, before });
      setVersions([...(versions ?? []), ...page]);
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setLoading(false);
    }
  };
  return (
    <details
      onToggle={(event) => {
        if (event.currentTarget.open && !versions && !loading) void loadMore();
      }}
    >
      <summary>{versionCount === 1 ? "1 version" : `All ${versionCount} versions`}</summary>
      {versions && <SubmissionHistory versions={versions} latestLabel={latestLabel} />}
      {loading && <p className="loading">Loading…</p>}
      {error && <p className="form-error">{error}</p>}
      {versions && versions.length < versionCount && !loading && (
        <button className="text-button" onClick={() => void loadMore()}>
          Show older versions
        </button>
      )}
    </details>
  );
}
