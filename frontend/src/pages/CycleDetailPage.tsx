import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { closeCycle, getCycle } from "../api/cycles";
import { BatchPanel } from "../components/BatchPanel";
import { FacultyCatalogSection } from "../components/CatalogPanel";
import { EnrollmentPanel } from "../components/EnrollmentPanel";
import { CompletionPanel } from "../components/FacultyTeamPanels";
import { IdeaStatusBadge } from "../components/IdeaPanels";
import { MilestonesTab } from "../components/MilestonePanels";
import { PhaseTimeline } from "../components/PhaseTimeline";
import { StudentTeamPanel } from "../components/TeamPanels";
import { TeamsList } from "../components/TeamsList";
import { countsOf, useCycleData } from "../cycle-data";
import {
  attentionItems,
  catalogSummary,
  cycleFacts,
  phaseOf,
  primaryAction,
  showsCompletion,
  showsIdeaList,
  submissionSummary,
  TABS,
  teamsEmpty,
  type PageTarget,
  type TabKey,
} from "../cycle-page";
import { formatDate } from "../dates";
import { readableError } from "../errors";
import { cyclePhases } from "../phases";
import { teamRows, type TeamFilter } from "../team-rows";
import { eventLabel, stageLabel } from "../timeline";
import type { Cycle } from "../types";

/** Brings a part of the page into view and moves focus to its heading. */
function scrollToPart(id: string) {
  requestAnimationFrame(() => {
    const part = document.getElementById(id);
    part?.scrollIntoView({ behavior: "smooth", block: "start" });
    part?.querySelector<HTMLElement>("summary, h2")?.focus();
  });
}

/**
 * A project. Students see its phases and their team. Its faculty see tabs
 * (Phase 8): Overview (where the project is, what comes next, what needs
 * them), Students, Teams, Ideas and Milestones. The tab is in the URL.
 */
export function CycleDetailPage({ faculty }: { faculty: boolean }) {
  const { cycleId = "" } = useParams();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [error, setError] = useState("");
  const [now] = useState(() => Date.now());
  // Loads the page's parts again after the faculty changed something.
  const [version, setVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TeamFilter>("all");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const backTo = faculty ? "/faculty/cycles" : "/student";
  const tab = (TABS.some((entry) => entry.key === search.get("tab")) ? search.get("tab") : "overview") as TabKey;

  const load = useCallback(() => {
    getCycle(cycleId)
      .then(setCycle)
      .catch((caught) => setError(readableError(caught)));
  }, [cycleId]);
  useEffect(load, [load]);
  const data = useCycleData(faculty ? cycle : null, version);
  const counts = countsOf(data, cycle ?? undefined, now);
  const rows =
    data.teams && data.ideas && data.submissions ? teamRows(data.teams, data.ideas, data.submissions) : null;

  if (error)
    return (
      <section>
        <button className="back-button" onClick={() => navigate(backTo)}>
          ← Back
        </button>
        <p className="form-error banner">{error}</p>
      </section>
    );
  if (!cycle) return <p className="loading">Loading project…</p>;

  const phase = phaseOf(cycle);
  const action = faculty ? primaryAction(cycle, phase, counts) : null;
  const empty = teamsEmpty(cycle, phase, counts);
  const attention = faculty ? attentionItems(cycle, phase, counts) : [];
  const phases = cyclePhases(
    cycle,
    cycle.publishedAt ?? cycle.createdAt,
    cycle.status === "CLOSED" ? cycle.closedAt : null,
    faculty ? "Ideas · you place students" : "Ideas · faculty place students",
  );
  const selectTab = (key: TabKey) => setSearch(key === "overview" ? {} : { tab: key }, { replace: true });
  const go = (target: PageTarget) => {
    if (target === "publish") return navigate(`/faculty/cycles/${cycleId}/edit?step=review`);
    if (target === "review") {
      // One waiting proposal opens its team; several show only the waiting ones.
      const waiting = rows?.filter((row) => row.idea?.status === "SUBMITTED") ?? [];
      if (waiting.length === 1) return navigate(`/faculty/cycles/${cycleId}/teams/${waiting[0].id}`);
      setQuery("");
      setFilter("waiting");
      selectTab("teams");
      return scrollToPart("teams");
    }
    if (target === "completion") {
      selectTab("teams");
      return scrollToPart(showsCompletion(cycle, phase, counts) ? "completion" : "teams");
    }
    selectTab(target);
  };

  const runAction = async () => {
    if (!action) return;
    if (action.kind === "go") return go(action.target);
    if (!window.confirm("Close this project? Nothing can change afterwards, and students can no longer submit.")) return;
    setBusy(true);
    setActionError("");
    try {
      setCycle(await closeCycle(cycle.id));
    } catch (caught) {
      setActionError(readableError(caught));
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <header className="cycle-header">
      <div className="cycle-heading">
        <p className="cycle-kicker">
          <span className={`status status-${cycle.status.toLowerCase()}`}>
            {cycle.status === "PUBLISHED" ? "Open" : cycle.status === "DRAFT" ? "Draft" : "Closed"}
          </span>
          <span className="eyebrow">
            {cycle.courseName} / Batch {cycle.batchYear}
          </span>
        </p>
        <h1>{cycle.title}</h1>
        {cycle.description && <p className="cycle-description">{cycle.description}</p>}
        <p className="cycle-facts">{cycleFacts(cycle)}</p>
      </div>
      {faculty && (
        <div className="cycle-actions">
          {action && (
            <button className="primary-button" disabled={busy} onClick={() => void runAction()}>
              {action.label}
            </button>
          )}
          {cycle.status !== "CLOSED" && (
            <button className="text-button" onClick={() => navigate(`/faculty/cycles/${cycle.id}/edit`)}>
              Edit project
            </button>
          )}
        </div>
      )}
    </header>
  );
  const timeline = (
    <PhaseTimeline
      label={cycle.status === "DRAFT" ? "Planned phases" : "Where the project is"}
      phases={phases}
      now={cycle.status === "DRAFT" ? undefined : now}
    />
  );

  if (!faculty) {
    return (
      <section className="detail-page">
        <button className="back-button" onClick={() => navigate(backTo)}>
          ← Back to projects
        </button>
        {header}
        <p className="stage-line">
          <strong>{stageLabel(cycle.currentStage)}</strong>
          {cycle.nextEvents[0] && ` · Next: ${eventLabel(cycle.nextEvents[0])}, ${formatDate(cycle.nextEvents[0].at)}`}
        </p>
        {timeline}
        <StudentTeamPanel cycle={cycle} />
      </section>
    );
  }

  const overview = (
    <div className="cycle-layout">
      {attention.length > 0 && (
        <section className="attention-card" aria-labelledby="attention-heading">
          <h2 id="attention-heading">Needs your attention</h2>
          <ul>
            {attention.map((item) => (
              <li key={item.key}>
                <span>{item.text}</span>
                <button className="text-button" onClick={() => go(item.target)}>
                  {item.action}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="cycle-main">
        <section className="side-card" aria-labelledby="next-heading">
          <h2 id="next-heading">Coming up</h2>
          {cycle.nextEvents.length === 0 ? (
            <p className="muted">{cycle.status === "CLOSED" ? "The project is closed." : "Nothing is left on the plan."}</p>
          ) : (
            <ul className="event-list">
              {cycle.nextEvents.map((event) => (
                <li key={`${event.kind}-${event.at}-${event.milestone?.id ?? ""}`}>
                  <strong>{eventLabel(event)}</strong>
                  <span>{formatDate(event.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <aside className="cycle-side" aria-label="The project at a glance">
        <section className="side-card" aria-labelledby="glance-heading">
          <h2 id="glance-heading">At a glance</h2>
          <ul className="glance">
            <li>
              {cycle.kind === "ELECTIVE" ? "Enrolled students" : `Batch ${cycle.batchYear} students`}
              {counts.roster && ` (${counts.roster.total})`} ·{" "}
              <button className="text-button" onClick={() => selectTab("students")}>
                Manage
              </button>
            </li>
            <li>{counts.teams === undefined ? "Teams: loading…" : `${counts.teams} ${counts.teams === 1 ? "team" : "teams"}`}</li>
            {showsIdeaList(cycle) && <li>Idea list: {catalogSummary(phase, counts)}</li>}
            <li>{submissionSummary(phase, counts)}</li>
          </ul>
        </section>
      </aside>
    </div>
  );

  const tabBody = () => {
    switch (tab) {
      case "overview":
        return overview;
      case "students":
        return cycle.kind === "ELECTIVE" ? <EnrollmentPanel cycle={cycle} /> : <BatchPanel cycle={cycle} />;
      case "teams":
        return (
          <>
            <TeamsList
              cycle={cycle}
              rows={rows}
              error={data.failed.teams ? "Couldn't load the teams. Reload the page to try again." : ""}
              query={query}
              filter={filter}
              onQuery={setQuery}
              onFilter={setFilter}
              empty={
                <p className="muted">
                  {empty.text}
                  {/* Not twice: the header's button may already be this step. */}
                  {empty.action && empty.action.label !== action?.label && (
                    <>
                      {" "}
                      <button className="text-button" onClick={() => go(empty.action!.target)}>
                        {empty.action.label}
                      </button>
                    </>
                  )}
                </p>
              }
            />
            {showsCompletion(cycle, phase, counts) && data.teams && data.overview && (
              <div id="completion">
                <CompletionPanel
                  cycle={cycle}
                  teams={data.teams}
                  overview={data.overview}
                  now={now}
                  onChanged={() => setVersion((current) => current + 1)}
                />
              </div>
            )}
          </>
        );
      case "ideas":
        return (
          <>
            <section className="team-panel" aria-labelledby="team-ideas-heading">
              <h2 id="team-ideas-heading">Teams' ideas</h2>
              {!rows ? (
                <p className="loading">Loading…</p>
              ) : rows.length === 0 ? (
                <p className="muted">No teams yet.</p>
              ) : (
                <ul className="idea-rows">
                  {rows.map((row) => (
                    <li key={row.id}>
                      <Link to={`/faculty/cycles/${cycle.id}/teams/${row.id}`}>{row.name}</Link>
                      <span>{row.idea ? row.idea.title : "No idea yet"}</span>
                      {row.idea && <IdeaStatusBadge idea={row.idea} />}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {showsIdeaList(cycle) ? (
              <FacultyCatalogSection cycle={cycle} />
            ) : (
              <p className="field-hint">Teams propose their own ideas in this project, so there is no idea list.</p>
            )}
          </>
        );
      case "milestones":
        return <MilestonesTab
            cycle={cycle}
            work={data.milestoneWork}
            failed={Boolean(data.failed.submissions)}
            now={now}
            onChanged={() => setVersion((current) => current + 1)}
          />;
    }
  };

  return (
    <section className="detail-page">
      <button className="back-button" onClick={() => navigate(backTo)}>
        ← Back to projects
      </button>
      {header}
      {actionError && (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      )}
      <p className="stage-line">
        <strong>{stageLabel(cycle.currentStage)}</strong>
      </p>
      {timeline}
      {cycle.status === "DRAFT" && (
        <p className="field-hint">Students can't see this project yet. Publish it when the plan is ready.</p>
      )}
      <nav className="tabs" aria-label="Project sections">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className={`tab${entry.key === tab ? " is-current" : ""}`}
            aria-current={entry.key === tab ? "page" : undefined}
            onClick={() => selectTab(entry.key)}
          >
            {entry.label}
          </button>
        ))}
      </nav>
      <div className="tab-body">{tabBody()}</div>
    </section>
  );
}
