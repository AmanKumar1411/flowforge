import { Link } from "react-router";
import { formatDate } from "../../dates";
import { marksText } from "../../grading";
import { projectPath, ROLE_TEXT, updateLink, upNextLink, upNextText } from "../../student-dashboard";
import { eventLabel, stageLabel } from "../../timeline";
import type { DashboardUpdate, ProjectCard, UpNextItem } from "../../types";

/** Things to do first (with their project tab), then dates coming up. */
export function UpNextList({ items }: { items: UpNextItem[] }) {
  return (
    <section className="side-card" aria-labelledby="up-next-heading">
      <h2 id="up-next-heading">Up next</h2>
      {items.length === 0 ? (
        <p className="muted">Nothing to do right now. New deadlines will show up here.</p>
      ) : (
        <ul className="event-list up-next">
          {items.map((item) => (
            <li key={`${item.cycle.id}-${item.kind}-${item.at ?? ""}-${item.text}`} className={item.action ? "is-action" : ""}>
              <Link to={upNextLink(item)}>{upNextText(item)}</Link>
              <span>
                {item.cycle.title}
                {item.action && !item.action.actionable ? " · your leader does this" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function UpdatesList({ updates }: { updates: DashboardUpdate[] }) {
  return (
    <section className="side-card" aria-labelledby="updates-heading">
      <h2 id="updates-heading">Updates</h2>
      {updates.length === 0 ? (
        <p className="muted">Feedback, results and team changes will appear here.</p>
      ) : (
        <ul className="event-list">
          {updates.map((update) => (
            <li key={`${update.cycle.id}-${update.kind}-${update.at}`}>
              <Link to={updateLink(update)}>{update.text}</Link>
              <span>
                {update.cycle.title} · {formatDate(update.at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ProjectCardView({ project }: { project: ProjectCard }) {
  const past = project.cycle.status === "CLOSED";
  return (
    <article className="cycle-card project-card">
      <Link className="card-link" to={projectPath(project.cycle.id)}>
        <div className="card-top">
          <span className={`status status-${project.cycle.status.toLowerCase()}`}>{past ? "Closed" : stageLabel(project.currentStage)}</span>
          <span>{ROLE_TEXT[project.myRole]}</span>
        </div>
        <h2>{project.cycle.title}</h2>
        <p className="course-name">{project.cycle.courseName}</p>
        {project.myTeam && (
          <p className="card-tag">
            Team {project.myTeam.name} · {project.myTeam.memberCount} {project.myTeam.memberCount === 1 ? "member" : "members"}
          </p>
        )}
        {project.todo && <p className="card-todo">To do: {project.todo}</p>}
        {!past && project.nextEvent && (
          <p className="field-hint">
            Next: {eventLabel(project.nextEvent)} · {formatDate(project.nextEvent.at)}
          </p>
        )}
        {project.results.length > 0 && (
          <ul className="card-results" aria-label="Results">
            {project.results.map((result) => (
              <li key={result.milestoneId}>
                {result.label}: {marksText(result) ?? "Feedback"}
                {result.updatedAfterRelease ? " (updated)" : ""}
              </li>
            ))}
          </ul>
        )}
      </Link>
    </article>
  );
}
