import { Link } from "react-router";
import { formatDate } from "../dates";
import { submissionWindow } from "../ideas";
import { requirementText } from "../links";
import type { Cycle, CycleSubmission } from "../types";
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
  return (
    <div className="milestone-list">
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
                    {row.versions.length > 0 && (
                      <details>
                        <summary>
                          {row.versionCount === 1 ? "1 version" : `All ${row.versionCount} versions`}
                        </summary>
                        <SubmissionHistory versions={row.versions} latestLabel={stage === "CLOSED" ? "Final" : "Latest"} />
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {cycle.status !== "DRAFT" && <GradingPanel cycle={cycle} milestone={milestone} onChanged={onChanged} />}
          </section>
        );
      })}
    </div>
  );
}
