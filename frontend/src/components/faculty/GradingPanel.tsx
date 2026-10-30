import { useCallback, useEffect, useState } from "react";
import { getGrading, releaseGrading, saveEvaluation, setMaxMarks } from "../../api/evaluations";
import { formatDate } from "../../dates";
import { readableError } from "../../errors";
import { gradingCounts, parseMarks, releaseConfirmText } from "../../grading";
import type { Cycle, Grading, GradingRow, Milestone } from "../../types";

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * The faculty's grading of one milestone (Phase 9, ADR 020): what it is
 * marked out of, each team's marks and feedback with its save state, and the
 * one-way release to every team. Marks stay editable after release.
 */
export function GradingPanel({
  cycle,
  milestone,
  onChanged,
}: {
  cycle: Cycle;
  milestone: Milestone;
  /** Told after a save or a release, so the page can update its counts. */
  onChanged?: () => void;
}) {
  const [grading, setGrading] = useState<Grading | null>(null);
  const [error, setError] = useState("");
  const [max, setMax] = useState("");
  const load = useCallback(() => {
    getGrading(cycle.id, milestone.id)
      .then((loaded) => {
        setGrading(loaded);
        setMax(loaded.maxMarks === null ? "" : String(loaded.maxMarks));
      })
      .catch((caught) => setError(readableError(caught)));
  }, [cycle.id, milestone.id]);
  useEffect(load, [load]);

  if (error && !grading) return <p className="form-error">{error}</p>;
  if (!grading) return <p className="loading">Loading grading…</p>;
  const counts = gradingCounts(grading);
  const owner = cycle.status !== "CLOSED";

  const saveMax = async () => {
    setError("");
    try {
      setGrading(await setMaxMarks(cycle.id, milestone.id, Number(max)));
    } catch (caught) {
      setError(readableError(caught));
    }
  };
  const release = async () => {
    if (!window.confirm(releaseConfirmText(grading))) return;
    setError("");
    try {
      setGrading(await releaseGrading(cycle.id, milestone.id));
      onChanged?.();
    } catch (caught) {
      setError(readableError(caught));
    }
  };

  return (
    <section className="grading" aria-label={`Grading of M${milestone.position}`}>
      <div className="grading-head">
        <h3>Grading</h3>
        {grading.releasedAt ? (
          <span className="status status-published">Released on {formatDate(grading.releasedAt)}</span>
        ) : (
          <span className="field-hint">
            {counts.graded} of {grading.rows.length} graded · not released
          </span>
        )}
      </div>
      {!grading.open && !grading.releasedAt && (
        <p className="field-hint">Teams can be graded from the due date, {formatDate(milestone.submissionDueAt)}.</p>
      )}
      <form
        className="grading-max"
        onSubmit={(event) => {
          event.preventDefault();
          void saveMax();
        }}
      >
        <label>
          Marked out of
          <input type="number" min={1} max={1000} value={max} onChange={(event) => setMax(event.target.value)} disabled={!owner} />
        </label>
        {owner && (
          <button className="text-button" disabled={!max || Number(max) === grading.maxMarks}>
            Save
          </button>
        )}
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <ul className="grading-rows">
        {grading.rows.map((row) => (
          <GradingRowEditor
            key={row.team.id}
            cycleId={cycle.id}
            milestoneId={milestone.id}
            row={row}
            maxMarks={grading.maxMarks}
            disabled={!grading.open}
            onSaved={() => {
              load();
              onChanged?.();
            }}
          />
        ))}
      </ul>
      {grading.open && !grading.releasedAt && (
        <button className="primary-button" disabled={counts.graded === 0} onClick={() => void release()}>
          Release results to all teams
        </button>
      )}
    </section>
  );
}

function GradingRowEditor({
  cycleId,
  milestoneId,
  row,
  maxMarks,
  disabled,
  onSaved,
}: {
  cycleId: string;
  milestoneId: string;
  row: GradingRow;
  maxMarks: number | null;
  disabled: boolean;
  onSaved: () => void;
}) {
  const [marks, setMarks] = useState(row.evaluation?.marks === null || !row.evaluation ? "" : String(row.evaluation.marks));
  const [feedback, setFeedback] = useState(row.evaluation?.feedback ?? "");
  const [state, setState] = useState<SaveState>("idle");
  const [problem, setProblem] = useState("");
  const parsed = parseMarks(marks);
  const changed =
    marks !== (row.evaluation?.marks == null ? "" : String(row.evaluation.marks)) ||
    feedback !== (row.evaluation?.feedback ?? "");

  const save = async () => {
    if (parsed.problem) return setProblem(parsed.problem);
    setState("saving");
    setProblem("");
    try {
      await saveEvaluation(cycleId, milestoneId, row.team.id, {
        marks: parsed.marks,
        feedback: feedback.trim() || null,
        ...(row.evaluation ? { expectedVersion: row.evaluation.version } : {}),
      });
      setState("saved");
      onSaved();
    } catch (caught) {
      setState("error");
      setProblem(readableError(caught));
    }
  };

  return (
    <li className="grading-row">
      <div className="grading-team">
        <strong>{row.team.name}</strong>
        {row.latestWork ? (
          <span className="field-hint">
            Version {row.latestWork.version} · {formatDate(row.latestWork.submittedAt)}
          </span>
        ) : (
          <span className="tag warning-tag">No submission</span>
        )}
      </div>
      <label>
        Marks{maxMarks ? ` (out of ${maxMarks})` : ""}
        <input
          inputMode="decimal"
          value={marks}
          onChange={(event) => setMarks(event.target.value)}
          disabled={disabled || !maxMarks}
          aria-label={`Marks for ${row.team.name}`}
        />
      </label>
      <label>
        Feedback
        <textarea
          rows={2}
          value={feedback}
          maxLength={4000}
          onChange={(event) => setFeedback(event.target.value)}
          disabled={disabled}
          aria-label={`Feedback for ${row.team.name}`}
        />
      </label>
      <div className="row-actions">
        <button className="dark-button compact" disabled={disabled || !changed || state === "saving"} onClick={() => void save()}>
          {state === "saving" ? "Saving…" : "Save"}
        </button>
        <span className="field-hint" role="status">
          {state === "saved" && !changed ? "Saved" : changed ? "Not saved" : row.evaluation ? `Version ${row.evaluation.version}` : ""}
        </span>
      </div>
      {problem && <p className="form-error">{problem}</p>}
    </li>
  );
}
