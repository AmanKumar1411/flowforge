import type { ReactNode } from "react";
import { formatDate } from "../dates";
import { eventLabel, stageLabel } from "../timeline";
import type { Cycle } from "../types";

export function CycleListShell({
  eyebrow,
  title,
  action,
  error,
  children,
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
  error: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="section-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
        </div>
        {action}
      </div>
      {error && <p className="form-error banner">{error}</p>}
      {children}
    </section>
  );
}

export function CycleCard({
  cycle,
  faculty,
  tag,
  onOpen,
  onEdit,
  onAction,
}: {
  cycle: Cycle;
  faculty?: boolean;
  /** A short note on the card, e.g. the student's team. */
  tag?: string;
  onOpen: () => void;
  onEdit?: () => void;
  onAction?: (action: "publish" | "close") => void;
}) {
  return (
    <article className="cycle-card">
      <button className="card-link" onClick={onOpen}>
        <div className="card-top">
          <span className={`status status-${cycle.status.toLowerCase()}`}>
            {cycle.status === "PUBLISHED" ? "Open" : cycle.status}
          </span>
          <span>
            {cycle.kind === "ELECTIVE" ? "Elective · " : ""}Batch{" "}
            {cycle.batchYear}
          </span>
        </div>
        <h2>{cycle.title}</h2>
        <p className="course-name">
          {cycle.courseName} · Semester {cycle.semester}
        </p>
        <p className="card-description">
          {cycle.description || "No description added yet."}
        </p>
        {tag && <p className="card-tag">{tag}</p>}
        <div className="card-footer">
          <span>{stageLabel(cycle.currentStage)}</span>
          <span>
            {cycle.nextEvents[0]
              ? `Next: ${eventLabel(cycle.nextEvents[0])} · ${formatDate(cycle.nextEvents[0].at)}`
              : cycle.academicYear}
          </span>
        </div>
      </button>
      {faculty && (
        <div className="card-actions">
          {cycle.status === "DRAFT" && (
            <>
              <button className="text-button" onClick={onEdit}>
                Edit
              </button>
              <button
                className="primary-button compact"
                onClick={() => onAction?.("publish")}
              >
                Publish
              </button>
            </>
          )}
          {cycle.status === "PUBLISHED" && (
            <>
              <button className="text-button" onClick={onEdit}>
                Edit
              </button>
              <button
                className="dark-button compact"
                onClick={() => onAction?.("close")}
              >
                Close
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <span className="empty-mark">○</span>
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  );
}
