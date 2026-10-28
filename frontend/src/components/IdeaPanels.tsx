import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  getTeamIdea,
  listCycleIdeas,
  reviewIdea,
  submitIdea,
} from "../api/ideas";
import { formatDate } from "../dates";
import { readableError } from "../errors";
import {
  ideaAction,
  ideaStatusLabel,
  isIdeaResubmissionOpen,
  isIdeaSubmissionOpen,
  reviewOrder,
  type IdeaAction,
} from "../ideas";
import type {
  Cycle,
  CycleIdea,
  Idea,
  IdeaContent,
  IdeaDecision,
  Team,
} from "../types";

const LIMITS = { title: 120, problem: 2000, solution: 4000, link: 500 };

const SAVE_LABELS: Record<IdeaAction, string> = {
  SUBMIT: "Submit idea",
  EDIT: "Save changes",
  RESUBMIT: "Resubmit idea",
};

/** A team's project idea: the leader submits and revises it; every member reads it with the faculty's feedback. */
export function TeamIdeaPanel({
  cycle,
  team,
  myId,
}: {
  cycle: Cycle;
  team: Team;
  myId: string;
}) {
  const [idea, setIdea] = useState<Idea | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [now] = useState(() => Date.now());
  const isLeader = team.leaderId === myId;

  useEffect(() => {
    getTeamIdea(team.id)
      .then(setIdea)
      .catch((caught) => setError(readableError(caught)));
  }, [team.id]);

  const action = idea === undefined ? null : ideaAction(idea, cycle, now);
  const save = async (content: IdeaContent) => {
    setIdea(await submitIdea(team.id, content));
    setEditing(false);
  };

  return (
    <section className="team-panel" aria-labelledby="idea-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Project idea</p>
          <h2 id="idea-heading">
            {idea === undefined ? "Loading…" : (idea?.title ?? "No idea yet")}
          </h2>
        </div>
        {idea && <IdeaStatusBadge idea={idea} />}
        {isLeader && action && !editing && (
          <button
            className="dark-button compact"
            onClick={() => setEditing(true)}
          >
            {action === "SUBMIT"
              ? "Write the idea"
              : action === "EDIT"
                ? "Edit idea"
                : "Revise and resubmit"}
          </button>
        )}
      </div>
      {idea !== undefined && (
        <p className="field-hint">{ideaNote(idea, cycle, now, isLeader)}</p>
      )}
      {error && <p className="form-error">{error}</p>}
      {editing && action ? (
        <IdeaForm
          initial={idea ?? null}
          saveLabel={SAVE_LABELS[action]}
          onSave={save}
          onCancel={() => setEditing(false)}
        />
      ) : (
        idea && <IdeaDetails idea={idea} />
      )}
    </section>
  );
}

function ideaNote(
  idea: Idea | null,
  cycle: Cycle,
  now: number,
  isLeader: boolean,
): string {
  const ideasDue = formatDate(cycle.ideaDeadline);
  const submissionsOpen = formatDate(cycle.submissionStartAt);
  if (!idea) {
    if (!isIdeaSubmissionOpen(cycle, now)) {
      return `The idea deadline (${ideasDue}) has passed without an idea from your team. Contact your faculty.`;
    }
    return isLeader
      ? `As the leader, submit your team's idea by ${ideasDue}.`
      : `Your team leader submits the team's idea by ${ideasDue}.`;
  }
  switch (idea.status) {
    case "SUBMITTED":
      return isIdeaSubmissionOpen(cycle, now)
        ? `Waiting for your faculty's review. ${isLeader ? "You" : "Your leader"} can still change it until ${ideasDue}.`
        : "Waiting for your faculty's review.";
    case "REJECTED":
      return isIdeaResubmissionOpen(cycle, now)
        ? `Your faculty asked for a different idea. ${isLeader ? "Revise it and resubmit" : "Your leader can revise and resubmit it"} until submissions open on ${submissionsOpen}.`
        : "Your faculty rejected this idea, and submissions have opened, so it can no longer be resubmitted. Contact your faculty.";
    case "APPROVED":
      return "Approved. This is your team's project for the cycle.";
  }
}

function IdeaStatusBadge({ idea }: { idea: Pick<Idea, "status"> }) {
  return (
    <span className={`idea-status idea-${idea.status.toLowerCase()}`}>
      {ideaStatusLabel(idea.status)}
    </span>
  );
}

function IdeaForm({
  initial,
  saveLabel,
  onSave,
  onCancel,
}: {
  initial: IdeaContent | null;
  saveLabel: string;
  onSave: (content: IdeaContent) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [problem, setProblem] = useState(initial?.problem ?? "");
  const [solution, setSolution] = useState(initial?.solution ?? "");
  const [link, setLink] = useState(initial?.link ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave({
        title: title.trim(),
        problem: problem.trim(),
        solution: solution.trim(),
        link: link.trim() || null,
      });
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="team-editor idea-form" onSubmit={submit}>
      <label>
        Idea title
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={LIMITS.title}
          required
        />
      </label>
      <label>
        Problem
        <textarea
          value={problem}
          onChange={(event) => setProblem(event.target.value)}
          maxLength={LIMITS.problem}
          rows={4}
          placeholder="What problem does your team want to solve, and for whom?"
          required
        />
      </label>
      <label>
        Proposed solution
        <textarea
          value={solution}
          onChange={(event) => setSolution(event.target.value)}
          maxLength={LIMITS.solution}
          rows={5}
          placeholder="How will you solve it? What will you build?"
          required
        />
      </label>
      <label>
        Link (optional)
        <input
          type="url"
          value={link}
          onChange={(event) => setLink(event.target.value)}
          maxLength={LIMITS.link}
          placeholder="https://… a repository, document or demo"
        />
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button type="button" className="text-button" onClick={onCancel}>
          Cancel
        </button>
        <button className="primary-button" disabled={busy}>
          {busy ? "Saving…" : saveLabel}
        </button>
      </div>
    </form>
  );
}

function IdeaDetails({ idea }: { idea: Idea }) {
  return (
    <div className="idea-details">
      <dl>
        <dt>Problem</dt>
        <dd>{idea.problem}</dd>
        <dt>Proposed solution</dt>
        <dd>{idea.solution}</dd>
        {idea.link && (
          <>
            <dt>Link</dt>
            <dd>
              <a href={idea.link} target="_blank" rel="noopener noreferrer">
                {idea.link}
              </a>
            </dd>
          </>
        )}
      </dl>
      <p className="field-hint">
        Version {idea.version}, submitted by {idea.submittedBy.name} on{" "}
        {formatDate(idea.submittedAt)}.
      </p>
      {idea.reviews.length > 0 && (
        <ol className="review-history" aria-label="Reviews">
          {idea.reviews.map((review) => (
            <li key={review.version}>
              <strong>
                {review.decision === "APPROVED" ? "Approved" : "Rejected"}
              </strong>{" "}
              version {review.version} · {review.reviewer.name} ·{" "}
              {formatDate(review.reviewedAt)}
              {review.feedback && <p>{review.feedback}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Every team's idea in a cycle: the owning faculty review them; admins only read. */
export function FacultyIdeasSection({
  cycle,
  canReview,
}: {
  cycle: Cycle;
  canReview: boolean;
}) {
  const [rows, setRows] = useState<CycleIdea[] | null>(null);
  const [openTeamId, setOpenTeamId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    listCycleIdeas(cycle.id)
      .then(setRows)
      .catch((caught) => setError(readableError(caught)));
  }, [cycle.id]);
  useEffect(load, [load]);

  const sorted = [...(rows ?? [])].sort(
    (a, b) =>
      reviewOrder(a.idea?.status ?? null) -
        reviewOrder(b.idea?.status ?? null) ||
      a.team.name.localeCompare(b.team.name),
  );
  const count = (status: Idea["status"] | null) =>
    sorted.filter((row) => (row.idea?.status ?? null) === status).length;
  const open = sorted.find((row) => row.team.id === openTeamId) ?? null;
  // A failed review usually means the idea changed meanwhile, so reload either way.
  const finishReview = (message: string, failed: boolean) => {
    setNotice(failed ? "" : message);
    setError(failed ? message : "");
    load();
  };

  return (
    <section className="team-panel" aria-labelledby="ideas-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Project ideas</p>
          <h2 id="ideas-heading">
            {rows
              ? `${count("SUBMITTED")} waiting for review`
              : "Loading…"}
          </h2>
        </div>
      </div>
      <p className="field-hint">
        Ideas are due {formatDate(cycle.ideaDeadline)}. A rejected idea can be
        resubmitted until submissions open on{" "}
        {formatDate(cycle.submissionStartAt)}.
        {rows &&
          ` ${count("APPROVED")} approved · ${count("REJECTED")} rejected · ${count(null)} without an idea.`}
      </p>
      {error && <p className="form-error">{error}</p>}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {rows && rows.length === 0 && (
        <p className="muted">No team has been formed yet.</p>
      )}
      {sorted.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Team</th>
              <th>Leader</th>
              <th>Idea</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ team, idea }) => (
              <tr key={team.id}>
                <td>{team.name}</td>
                <td>{team.leader.name}</td>
                <td>{idea?.title ?? <span className="muted">—</span>}</td>
                <td>{idea ? ideaStatusLabel(idea.status) : "No idea yet"}</td>
                <td className="row-actions">
                  {idea && (
                    <button
                      className="text-button"
                      aria-label={`Open the idea of ${team.name}`}
                      onClick={() =>
                        setOpenTeamId(openTeamId === team.id ? null : team.id)
                      }
                    >
                      {openTeamId === team.id
                        ? "Close"
                        : canReview && idea.status === "SUBMITTED"
                          ? "Review"
                          : "View"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {open?.idea && (
        <IdeaReviewPanel
          key={`${open.team.id}-${open.idea.version}-${open.idea.status}`}
          cycle={cycle}
          teamName={open.team.name}
          idea={open.idea}
          canReview={canReview}
          onDone={finishReview}
        />
      )}
    </section>
  );
}

function IdeaReviewPanel({
  cycle,
  teamName,
  idea,
  canReview,
  onDone,
}: {
  cycle: Cycle;
  teamName: string;
  idea: Idea;
  canReview: boolean;
  onDone: (message: string, failed: boolean) => void;
}) {
  const [decision, setDecision] = useState<IdeaDecision>("APPROVED");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const reviewable =
    canReview && idea.status === "SUBMITTED" && cycle.status === "PUBLISHED";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await reviewIdea(idea.teamId, {
        version: idea.version,
        decision,
        feedback: feedback.trim() || null,
      });
      onDone(
        `${decision === "APPROVED" ? "Approved" : "Rejected"} the idea of ${teamName}.`,
        false,
      );
    } catch (caught) {
      onDone(readableError(caught), true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="idea-review" aria-label={`Idea of ${teamName}`}>
      <div className="panel-heading">
        <h3>
          {teamName}: {idea.title}
        </h3>
        <IdeaStatusBadge idea={idea} />
      </div>
      <IdeaDetails idea={idea} />
      {reviewable && (
        <form className="team-editor" onSubmit={submit}>
          <fieldset className="decision-options">
            <legend>Decision on version {idea.version}</legend>
            <label>
              <input
                type="radio"
                name="decision"
                checked={decision === "APPROVED"}
                onChange={() => setDecision("APPROVED")}
              />
              Approve
            </label>
            <label>
              <input
                type="radio"
                name="decision"
                checked={decision === "REJECTED"}
                onChange={() => setDecision("REJECTED")}
              />
              Reject
            </label>
          </fieldset>
          <label>
            Feedback for the team
            {decision === "REJECTED" ? " (required)" : " (optional)"}
            <textarea
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              maxLength={2000}
              rows={3}
              required={decision === "REJECTED"}
            />
          </label>
          <div className="form-actions">
            <button className="primary-button" disabled={busy}>
              {decision === "APPROVED" ? "Approve idea" : "Reject idea"}
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
