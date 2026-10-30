import { useCallback, useEffect, useState, type FormEvent } from "react";
import { listTeamSubmissions, submitWork } from "../api/submissions";
import { formatDate } from "../dates";
import { readableError } from "../errors";
import { submissionWindow } from "../ideas";
import {
  allowedTypes,
  LINK_LABELS,
  LINK_PLACEHOLDERS,
  linkProblems,
  linksFrom,
  requirementText,
  valuesOf,
  type LinkValues,
} from "../links";
import type { Cycle, Idea, Link, LinkRequirement, Milestone, Submission, Team } from "../types";
import { EvaluationBlock } from "./student/EvaluationBlock";

const LIMITS = { url: 500, notes: 4000 };

/**
 * A team's work: the same versioned card once per milestone (Phase 8). Any
 * member adds a version while that milestone is open and the team's idea is
 * approved or picked; the newest version before the due date is final.
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
  const [now] = useState(() => Date.now());
  if (cycle.milestones.length === 0) return null;
  return (
    <>
      {cycle.milestones.map((milestone) => (
        <MilestoneCard key={milestone.id} cycle={cycle} milestone={milestone} team={team} idea={idea} now={now} />
      ))}
    </>
  );
}

function MilestoneCard({
  cycle,
  milestone,
  team,
  idea,
  now,
}: {
  cycle: Cycle;
  milestone: Milestone;
  team: Team;
  idea: Idea | null | undefined;
  now: number;
}) {
  const [versions, setVersions] = useState<Submission[] | null>(null);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState("");
  const stage = submissionWindow(cycle, milestone, now);
  const canSubmit = stage === "OPEN" && idea?.status === "APPROVED";
  const headingId = `work-heading-${milestone.id}`;

  const load = useCallback(() => {
    listTeamSubmissions(team.id, milestone.id)
      .then(setVersions)
      .catch((caught) => setError(readableError(caught)));
  }, [team.id, milestone.id]);
  useEffect(load, [load]);

  const save = async (links: Link[], notes: string | null) => {
    await submitWork(team.id, milestone.id, { links, notes });
    setWriting(false);
    load();
  };
  const latest = versions?.[0] ?? null;
  const status =
    versions === null ? "Loading…" : latest ? `Version ${latest.version} submitted` : "Nothing submitted yet";

  return (
    <section className={`team-panel milestone-card is-${stage.toLowerCase()}`} aria-labelledby={headingId}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">
            M{milestone.position} · {stage === "OPEN" ? "Open now" : stage === "NOT_OPEN" ? "Coming up" : "Closed"}
          </p>
          <h2 id={headingId}>
            {milestone.name}: {status}
          </h2>
        </div>
        {canSubmit && !writing && (
          <button className="dark-button compact" onClick={() => setWriting(true)}>
            {latest ? "Submit a new version" : "Submit work"}
          </button>
        )}
      </div>
      {milestone.description && <p>{milestone.description}</p>}
      <p className="field-hint">{workNote(milestone, stage, idea)}</p>
      <p className="field-hint">Links: {requirementText(milestone.linkRequirement)}</p>
      {error && <p className="form-error">{error}</p>}
      {writing && (
        <SubmissionForm
          requirement={milestone.linkRequirement}
          initial={latest?.links ?? []}
          nextVersion={(latest?.version ?? 0) + 1}
          onSave={save}
          onCancel={() => setWriting(false)}
        />
      )}
      {versions && versions.length > 0 && (
        <SubmissionHistory versions={versions} latestLabel={stage === "CLOSED" ? "Final" : "Latest"} />
      )}
      <EvaluationBlock cycle={cycle} milestone={milestone} teamId={team.id} now={now} />
    </section>
  );
}

function workNote(
  milestone: Milestone,
  stage: ReturnType<typeof submissionWindow>,
  idea: Idea | null | undefined,
): string {
  const closes = formatDate(milestone.submissionDueAt);
  if (stage === "CLOSED") {
    return `Closed on ${closes}. Your latest version before then is final; it is evaluated ${formatDate(milestone.evaluationAt)}.`;
  }
  const gate =
    idea?.status === "APPROVED"
      ? ""
      : " Your team can submit once its idea is approved or picked from the faculty's list.";
  if (stage === "NOT_OPEN") {
    return `Opens ${formatDate(milestone.submissionOpensAt)} and is due ${closes}.${gate}`;
  }
  return `Due ${closes}. Anyone in the team can submit; every submission is a new version, and the latest one before the due date counts.${gate}`;
}

/** One input per link type the requirement allows, required ones first. */
export function LinkFields({
  requirement,
  values,
  problems,
  onChange,
}: {
  requirement: LinkRequirement;
  values: LinkValues;
  problems: LinkValues;
  onChange: (values: LinkValues) => void;
}) {
  return (
    <>
      {allowedTypes(requirement).map((type) => (
        <label key={type}>
          {LINK_LABELS[type]}
          {requirement.required.includes(type) ? "" : " (optional)"}
          <input
            type="url"
            value={values[type] ?? ""}
            onChange={(event) => onChange({ ...values, [type]: event.target.value })}
            maxLength={LIMITS.url}
            placeholder={LINK_PLACEHOLDERS[type]}
            aria-invalid={problems[type] ? true : undefined}
          />
          {problems[type] && <span className="field-problem">{problems[type]}</span>}
        </label>
      ))}
    </>
  );
}

function SubmissionForm({
  requirement,
  initial,
  nextVersion,
  onSave,
  onCancel,
}: {
  requirement: LinkRequirement;
  initial: Link[];
  nextVersion: number;
  onSave: (links: Link[], notes: string | null) => Promise<void>;
  onCancel: () => void;
}) {
  // Links carry over from the last version; the notes describe this one.
  const [values, setValues] = useState<LinkValues>(() => valuesOf(initial));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState("");
  const problems = tried ? linkProblems(requirement, values) : {};

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (Object.keys(linkProblems(requirement, values)).length > 0) return;
    setBusy(true);
    setError("");
    try {
      await onSave(linksFrom(requirement, values), notes.trim() || null);
    } catch (caught) {
      setError(readableError(caught));
      setBusy(false);
    }
  };

  return (
    <form className="team-editor idea-form" onSubmit={submit} noValidate>
      <LinkFields requirement={requirement} values={values} problems={problems} onChange={setValues} />
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

/** Links as "GitHub repository · Demo" anchors. */
export function LinkList({ links }: { links: Link[] }) {
  if (links.length === 0) return null;
  return (
    <div className="submission-links">
      {links.map((link) => (
        <a key={link.type} href={link.url} target="_blank" rel="noopener noreferrer">
          {LINK_LABELS[link.type]}
        </a>
      ))}
    </div>
  );
}

/** Versions, newest first; with `latestLabel`, the newest is marked ("Final" once the milestone closes). */
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
          <LinkList links={version.links} />
          {version.notes && <p>{version.notes}</p>}
        </li>
      ))}
    </ol>
  );
}
