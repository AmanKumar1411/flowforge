import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { getCycle } from "../api/cycles";
import { getDashboard } from "../api/dashboard";
import { PhaseTimeline } from "../components/PhaseTimeline";
import { StudentTeamPanel } from "../components/TeamPanels";
import { cycleFacts } from "../cycle-page";
import { formatDate } from "../dates";
import { readableError } from "../errors";
import { cyclePhases } from "../phases";
import { PROJECT_TABS, projectPath, tabOf, todosFor, upNextText } from "../student-dashboard";
import { eventLabel, stageLabel } from "../timeline";
import type { Cycle, UpNextItem } from "../types";

/** A project for a student (Phase 9): overview, team, idea and milestones as tabs in the URL. */
export function StudentProjectPage() {
  const { cycleId = "" } = useParams();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [todos, setTodos] = useState<UpNextItem[]>([]);
  const [error, setError] = useState("");
  const [now] = useState(() => Date.now());
  const tab = tabOf(search.get("tab"));

  useEffect(() => {
    getCycle(cycleId)
      .then(setCycle)
      .catch((caught) => setError(readableError(caught)));
    getDashboard()
      .then((dashboard) => setTodos(todosFor(cycleId, dashboard.upNext)))
      .catch(() => setTodos([]));
  }, [cycleId]);

  if (error) {
    return (
      <section>
        <button className="back-button" onClick={() => navigate("/student")}>
          ← Back to your projects
        </button>
        <p className="form-error banner">{error}</p>
      </section>
    );
  }
  if (!cycle) return <p className="loading">Loading project…</p>;
  const closed = cycle.status === "CLOSED";

  return (
    <section className="detail-page student-project">
      <button className="back-button" onClick={() => navigate("/student")}>
        ← Back to your projects
      </button>
      <header className="cycle-header">
        <div className="cycle-heading">
          <p className="cycle-kicker">
            <span className={`status status-${cycle.status.toLowerCase()}`}>{closed ? "Closed" : "Open"}</span>
            <span className="eyebrow">{cycle.courseName}</span>
          </p>
          <h1>{cycle.title}</h1>
          {cycle.description && <p className="cycle-description">{cycle.description}</p>}
          <p className="cycle-facts">{cycleFacts(cycle)}</p>
        </div>
      </header>
      {closed && (
        <p className="notice" role="status">
          This project is closed. You can still read your team, idea, work and results, but nothing can change.
        </p>
      )}
      <nav className="tabs" aria-label="Project sections">
        {PROJECT_TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className={`tab${entry.key === tab ? " is-current" : ""}`}
            aria-current={entry.key === tab ? "page" : undefined}
            onClick={() => setSearch(entry.key === "overview" ? {} : { tab: entry.key }, { replace: true })}
          >
            {entry.label}
          </button>
        ))}
      </nav>
      <div className="tab-body">
        {tab === "overview" && (
          <>
            <p className="stage-line">
              <strong>{stageLabel(cycle.currentStage)}</strong>
              {cycle.nextEvents[0] && ` · Next: ${eventLabel(cycle.nextEvents[0])}, ${formatDate(cycle.nextEvents[0].at)}`}
            </p>
            <PhaseTimeline
              label="Where the project is"
              phases={cyclePhases(cycle, cycle.publishedAt ?? cycle.createdAt, closed ? cycle.closedAt : null, "Ideas · faculty place students")}
              now={now}
            />
            <section className="side-card" aria-labelledby="todo-heading">
              <h2 id="todo-heading">What you need to do now</h2>
              {todos.length === 0 ? (
                <p className="muted">{closed ? "Nothing: the project is closed." : "Nothing right now."}</p>
              ) : (
                <ul className="event-list">
                  {todos.map((item) => (
                    <li key={`${item.kind}-${item.text}`}>
                      {item.action?.actionable ? (
                        <Link className="dark-button compact" to={projectPath(cycle.id, item.action.tab)}>
                          {upNextText(item)}
                        </Link>
                      ) : (
                        <span>{upNextText(item)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
        {tab !== "overview" && <StudentTeamPanel cycle={cycle} show={tab} />}
      </div>
    </section>
  );
}

/** Old links (`/student/cycles/:id`) open the project page. */
export function OldProjectLink() {
  const { cycleId = "" } = useParams();
  return <NavigateTo to={projectPath(cycleId, "all")} />;
}

function NavigateTo({ to }: { to: string }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(to, { replace: true });
  }, [navigate, to]);
  return null;
}
