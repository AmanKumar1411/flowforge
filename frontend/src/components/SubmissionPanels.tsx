import { useCallback, useEffect, useState, type FormEvent } from "react";
import { listTeamSubmissions, submitWork } from "../api/submissions";
import { formatDate } from "../dates";
import { readableError } from "../errors";
import { submissionWindow } from "../ideas";
import type {
  Cycle,
  Idea,
  Submission,
  SubmissionContent,
  Team,
} from "../types";

const LIMITS = { url: 500, notes: 4000 };

/**
 * A team's submitted work. Any member adds a version while submissions are
 * open and the team's idea is approved or picked; the newest version before
 * the deadline is the final one.
 */
export function TeamSubmissionPanel({
  cycle,
  team,
  idea,
}: {
  cycle: Cycle;
  team: Team;
  /** The team's idea as the idea panel last loaded it; undefined while loading. */
  idea: Idea | null | undefined;
}) {
  const [versions, setVersions] = useState<Submission[] | null>(null);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState("");
  const [now] = useState(() => Date.now());
  const stage = submissionWindow(cycle, now);
  const approved = idea?.status === "APPROVED";
  const canSubmit = stage === "OPEN" && approved;

  const load = useCallback(() => {
    listTeamSubmissions(team.id)
      .then(setVersions)
      .catch((caught) => setError(readableError(caught)));
  }, [team.id]);
  useEffect(load, [load]);

  const save = async (content: SubmissionContent) => {
    await submitWork(team.id, content);
    setWriting(false);
    load();
  };
  const latest = versions?.[0] ?? null;

  return (
    <section className="team-panel" aria-labelledby="work-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Project work</p>
          <h2 id="work-heading">
            {versions === null
              ? "Loading…"
              : latest
                ? `Version ${latest.version} submitted`
                : "Nothing submitted yet"}
          </h2>
        </div>
        {canSubmit && !writing && (
          <button
            className="dark-button compact"
            onClick={() => setWriting(true)}
          >
            {latest ? "Submit a new version" : "Submit work"}
          </button>
        )}
      </div>
      <p className="field-hint">{workNote(cycle, stage, idea)}</p>
      {error && <p className="form-error">{error}</p>}
      {writing && (
        <SubmissionForm
          initial={latest}
          nextVersion={(latest?.version ?? 0) + 1}
          onSave={save}
          onCancel={() => setWriting(false)}
        />
      )}
      {versions && versions.length > 0 && (
        <SubmissionHistory versions={versions} />
      )}
    </section>
  );
}

function workNote(
  cycle: Cycle,
  stage: ReturnType<typeof submissionWindow>,
  idea: Idea | null | undefined,
): string {
  const opens = formatDate(cycle.submissionStartAt);
  const closes = formatDate(cycle.submissionDeadline);
  if (stage === "CLOSED") {
    return `Submissions closed on ${closes}. Your latest version before then is final.`;
  }
  const gate =
    idea?.status === "APPROVED"
      ? ""
      : " Your team can submit once its idea is approved or picked from the faculty's list.";
  if (stage === "NOT_OPEN") {
    return `Submissions open on ${opens} and close on ${closes}.${gate}`;
  }
  return `Open until ${closes}. Anyone in the team can submit; every submission is a new version, and the latest one before the deadline counts.${gate}`;
}

function SubmissionForm({
  initial,
  nextVersion,
  onSave,
  onCancel,
}: {
  initial: SubmissionContent | null;
  nextVersion: number;
  onSave: (content: SubmissionContent) => Promise<void>;
  onCancel: () => void;
}) {
  // Links carry over from the last version; the notes describe this one.
  const [repositoryUrl, setRepositoryUrl] = useState(
    initial?.repositoryUrl ?? "",
  );
  const [demoUrl, setDemoUrl] = useState(initial?.demoUrl ?? "");
  const [reportUrl, setReportUrl] = useState(initial?.reportUrl ?? "");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave({
        repositoryUrl: repositoryUrl.trim(),
        demoUrl: demoUrl.trim() || null,
        reportUrl: reportUrl.trim() || null,
        notes: notes.trim() || null,
      });
    } catch (caught) {
      setError(readableError(caught));
      setBusy(false);
    }
  };

  return (
    <form className="team-editor idea-form" onSubmit={submit}>
      <label>
        Repository URL
        <input
          type="url"
          value={repositoryUrl}
          onChange={(event) => setRepositoryUrl(event.target.value)}
          maxLength={LIMITS.url}
          placeholder="https://github.com/…"
          required
        />
      </label>
      <label>
        Demo URL (optional)
        <input
          type="url"
          value={demoUrl}
          onChange={(event) => setDemoUrl(event.target.value)}
          maxLength={LIMITS.url}
        />
      </label>
      <label>
        Report or slides URL (optional)
        <input
          type="url"
          value={reportUrl}
          onChange={(event) => setReportUrl(event.target.value)}
          maxLength={LIMITS.url}
        />
      </label>
      <label>
        Notes (optional)
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={LIMITS.notes}
          rows={3}
          placeholder="What is new in this version, how to run it"
        />
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button type="button" className="text-button" onClick={onCancel}>
          Cancel
        </button>
        <button className="primary-button" disabled={busy}>
          {busy ? "Submitting…" : `Submit version ${nextVersion}`}
        </button>
      </div>
    </form>
  );
}

function ExternalLink({ href, label }: { href: string | null; label: string }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  );
}

/** Versions, newest first; with `latestLabel`, the newest is marked ("Final" once submissions close). */
export function SubmissionHistory({
  versions,
  latestLabel,
}: {
  versions: Submission[];
  latestLabel?: string;
}) {
  return (
    <ol className="submission-history" aria-label="Submitted versions">
      {versions.map((version, index) => (
        <li key={version.id}>
          <strong>Version {version.version}</strong>
          {latestLabel && index === 0 && <span className="final-tag">{latestLabel}</span>} ·{" "}
          {version.submittedBy.name} · {formatDate(version.submittedAt)}
          <div className="submission-links">
            <ExternalLink href={version.repositoryUrl} label="Repository" />
            <ExternalLink href={version.demoUrl} label="Demo" />
            <ExternalLink href={version.reportUrl} label="Report" />
          </div>
          {version.notes && <p>{version.notes}</p>}
        </li>
      ))}
    </ol>
  );
}
