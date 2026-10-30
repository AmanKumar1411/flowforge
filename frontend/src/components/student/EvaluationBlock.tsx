import { useEffect, useState } from "react";
import { listTeamEvaluations } from "../../api/evaluations";
import { readableError } from "../../errors";
import { evaluationDates, marksText } from "../../grading";
import type { Cycle, Milestone, TeamEvaluation } from "../../types";

/** A milestone's result for the student's team: shown once the faculty release it (ADR 020). */
export function EvaluationBlock({ cycle, milestone, teamId, now }: { cycle: Cycle; milestone: Milestone; teamId: string; now: number }) {
  const [evaluations, setEvaluations] = useState<TeamEvaluation[] | null>(null);
  const [error, setError] = useState("");
  const due = Date.parse(milestone.submissionDueAt) <= now;
  useEffect(() => {
    if (!due) return;
    listTeamEvaluations(cycle.id, milestone.id, teamId)
      .then(setEvaluations)
      .catch((caught) => setError(readableError(caught)));
  }, [cycle.id, milestone.id, teamId, due]);
  if (!due) return null;
  const evaluation = evaluations?.[0];
  return (
    <div className="evaluation-block">
      <h3>Evaluation</h3>
      {error && <p className="form-error">{error}</p>}
      {evaluations && !evaluation && <p className="muted">Not released yet. Your faculty release every team's results together.</p>}
      {evaluation && (
        <>
          {marksText(evaluation) && <p className="evaluation-marks">{marksText(evaluation)}</p>}
          {evaluation.feedback && <p className="evaluation-feedback">{evaluation.feedback}</p>}
          {evaluationDates(evaluation).map((line) => (
            <p key={line} className="field-hint">
              {line}
            </p>
          ))}
        </>
      )}
    </div>
  );
}
