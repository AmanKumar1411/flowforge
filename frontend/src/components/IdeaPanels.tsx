import { useEffect, useState, type FormEvent } from "react";
import {
  getTeamIdea,
  listCatalog,
  pickIdea,
  reviewIdea,
  submitIdea,
} from "../api/ideas";
import { formatDate } from "../dates";
import { readableError } from "../errors";
import { linkProblems, linksFrom, valuesOf, type LinkValues } from "../links";
import {
  ideaAction,
  ideaStatusLabel,
  isIdeaResubmissionOpen,
  isIdeaSubmissionOpen,
  type IdeaAction,
} from "../ideas";
import type {
  CatalogIdea,
  Cycle,
  Idea,
  IdeaContent,
  IdeaDecision,
  LinkRequirement,
  Team,
} from "../types";
import { LinkFields, LinkList } from "./SubmissionPanels";

const LIMITS = { title: 120, problem: 2000, solution: 4000 };

const SAVE_LABELS: Record<IdeaAction, string> = {
  SUBMIT: "Submit idea",
  EDIT: "Save changes",
  RESUBMIT: "Resubmit idea",
};

/**
 * A team's project idea: the leader proposes and revises it, or picks one
 * from the faculty's list; every member reads it with the faculty's feedback.
 */
export function TeamIdeaPanel({
  cycle,
  team,
  myId,
  onIdeaChange,
}: {
  cycle: Cycle;
  team: Team;
  myId: string;
  /** Told about the idea once loaded and after every change. */
  onIdeaChange?: (idea: Idea | null) => void;
}) {
  const [idea, setIdea] = useState<Idea | null | undefined>(undefined);
  const [catalog, setCatalog] = useState<CatalogIdea[]>([]);
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState("");
  const [now] = useState(() => Date.now());
  const isLeader = team.leaderId === myId;

  useEffect(() => {
    getTeamIdea(team.id)
      .then(setIdea)
      .catch((caught) => setError(readableError(caught)));
    listCatalog(cycle.id)
      .then(setCatalog)
      .catch((caught) => setError(readableError(caught)));
  }, [team.id, cycle.id]);
  useEffect(() => {
    if (idea !== undefined) onIdeaChange?.(idea);
  }, [idea, onIdeaChange]);

  const action = idea === undefined ? null : ideaAction(idea, cycle, now);
  const save = async (content: IdeaContent) => {
    setIdea(await submitIdea(team.id, content));
    setEditing(false);
  };
  const pick = async (catalogIdea: CatalogIdea) => {
    setIdea(await pickIdea(team.id, catalogIdea.id));
    setPicking(false);
    setCatalog(await listCatalog(cycle.id));
  };
  // The list shows while the team still needs an idea; with a waiting proposal, on request.
  // Phase 8: the project decides whether teams propose, pick from the list, or either.
  const offered = cycle.ideaSource === "STUDENT_PROPOSALS" ? [] : catalog;
  const canPropose = cycle.ideaSource !== "FACULTY_LIST";
  const showCatalog =
    offered.length > 0 &&
    idea !== undefined &&
    !editing &&
    (idea === null || idea.status === "REJECTED" || picking);

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
          <div className="row-actions">
            {action === "EDIT" && offered.length > 0 && (
              <button
                className="text-button"
                onClick={() => setPicking(!picking)}
              >
                {picking ? "Keep our proposal" : "Pick from the list instead"}
              </button>
            )}
            {canPropose && (
              <button
                className="dark-button compact"
                onClick={() => {
                  setEditing(true);
                  setPicking(false);
                }}
              >
                {action === "SUBMIT"
                  ? "Write our own idea"
                  : action === "EDIT"
                    ? "Edit idea"
                    : "Revise and resubmit"}
              </button>
            )}
          </div>
        )}
      </div>
      {idea !== undefined && (
        <p className="field-hint">
          {ideaNote(idea, cycle, now, isLeader, offered.length > 0)}
        </p>
      )}
      {error && <p className="form-error">{error}</p>}
      {editing && action ? (
        <IdeaForm
          initial={
            idea?.source === "PROPOSAL"
              ? { ...idea, solution: idea.solution ?? "" }
              : null
          }
          saveLabel={SAVE_LABELS[action]}
          requirement={cycle.ideaLinkRequirement}
          onSave={save}
          onCancel={() => setEditing(false)}
        />
      ) : (
        idea && <IdeaDetails idea={idea} />
      )}
      {showCatalog && (
        <CatalogList
          ideas={offered}
          onPick={isLeader && action ? pick : undefined}
        />
      )}
    </section>
  );
}

function ideaNote(
  idea: Idea | null,
  cycle: Cycle,
  now: number,
  isLeader: boolean,
  hasCatalog: boolean,
): string {
  const ideasDue = formatDate(cycle.ideaDeadline);
  if (!idea) {
    if (!isIdeaSubmissionOpen(cycle, now)) {
      return `The idea deadline (${ideasDue}) has passed without an idea from your team. Contact your faculty.`;
    }
    if (!isLeader) {
      return `Your team leader ${hasCatalog ? "writes the team's own idea or picks one of your faculty's ideas" : "submits the team's idea"} by ${ideasDue}.`;
    }
    return hasCatalog
      ? `As the leader, write your team's own idea or pick one from your faculty's list below by ${ideasDue}. A pick is approved at once and final.`
      : `As the leader, submit your team's idea by ${ideasDue}.`;
  }
  switch (idea.status) {
    case "SUBMITTED":
      return isIdeaSubmissionOpen(cycle, now)
        ? `Waiting for your faculty's review. ${isLeader ? "You" : "Your leader"} can still change it until ${ideasDue}.`
        : "Waiting for your faculty's review.";
    case "REJECTED":
      if (!isIdeaResubmissionOpen(cycle)) {
        return "Your faculty rejected this idea, and the project is closed, so it can no longer change.";
      }
      return `Your faculty asked for a different idea. ${
        isLeader
          ? `Revise and resubmit it${hasCatalog ? ", or pick one from the list below" : ""}`
          : "Your leader can revise and resubmit it"
      }; there is no deadline for these rounds.`;
    case "APPROVED":
      return idea.source === "CATALOG"
        ? "Picked from your faculty's list. This is your team's idea for this project."
        : "Approved. This is your team's idea for this project.";
  }
}

export function IdeaStatusBadge({ idea }: { idea: Pick<Idea, "status" | "source"> }) {
  return (
    <span className={`idea-status idea-${idea.status.toLowerCase()}`}>
      {ideaStatusLabel(idea.status, idea.source)}
    </span>
  );
}

function pickCountLabel(count: number) {
  if (count === 0) return "No team has picked it yet";
  return `Picked by ${count} ${count === 1 ? "team" : "teams"}`;
}

/** The faculty's ideas; with `onPick`, the leader can make one the team's project after confirming. */
function CatalogList({
  ideas,
  onPick,
}: {
  ideas: CatalogIdea[];
  onPick?: (idea: CatalogIdea) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const confirm = async (idea: CatalogIdea) => {
    setBusy(true);
    setError("");
    try {
      await onPick?.(idea);
    } catch (caught) {
      setError(readableError(caught));
      setBusy(false);
    }
  };

  return (
    <div className="catalog-list">
      <h3>Ideas from your faculty</h3>
      {error && <p className="form-error">{error}</p>}
      <ul aria-label="Ideas from your faculty">
        {ideas.map((idea) => (
          <li key={idea.id}>
            <strong>{idea.title}</strong>
            <p>{idea.description}</p>
            {idea.link && (
              <a href={idea.link} target="_blank" rel="noopener noreferrer">
                {idea.link}
              </a>
            )}
            <p className="field-hint">{pickCountLabel(idea.pickCount)}</p>
            {onPick &&
              (confirming === idea.id ? (
                <div className="form-actions">
                  <button
                    className="text-button"
                    onClick={() => setConfirming(null)}
                  >
                    Cancel
                  </button>
                  <button
                    className="primary-button"
                    disabled={busy}
                    onClick={() => confirm(idea)}
                  >
                    {busy ? "Picking…" : "Confirm: make it our idea"}
                  </button>
                </div>
              ) : (
                <button
                  className="dark-button compact"
                  aria-label={`Pick ${idea.title}`}
                  onClick={() => setConfirming(idea.id)}
                >
                  Pick this idea
                </button>
              ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

function IdeaForm({
  initial,
  saveLabel,
  requirement,
  onSave,
  onCancel,
}: {
  initial: IdeaContent | null;
  saveLabel: string;
  requirement: LinkRequirement;
  onSave: (content: IdeaContent) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [problem, setProblem] = useState(initial?.problem ?? "");
  const [solution, setSolution] = useState(initial?.solution ?? "");
  const [links, setLinks] = useState<LinkValues>(() => valuesOf(initial?.links ?? []));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const problems = tried ? linkProblems(requirement, links) : {};

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (Object.keys(linkProblems(requirement, links)).length > 0) return;
    setBusy(true);
    setError("");
    try {
      await onSave({
        title: title.trim(),
        problem: problem.trim(),
        solution: solution.trim(),
        links: linksFrom(requirement, links),
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
      <LinkFields requirement={requirement} values={links} problems={problems} onChange={setLinks} />
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

export function IdeaDetails({ idea }: { idea: Idea }) {
  const picked = idea.source === "CATALOG";
  return (
    <div className="idea-details">
      <dl>
        <dt>{picked ? "Description" : "Problem"}</dt>
        <dd>{idea.problem}</dd>
        {idea.solution !== null && (
          <>
            <dt>Proposed solution</dt>
            <dd>{idea.solution}</dd>
          </>
        )}
        {idea.links.length > 0 && (
          <>
            <dt>Links</dt>
            <dd>
              <LinkList links={idea.links} />
            </dd>
          </>
        )}
      </dl>
      <p className="field-hint">
        Version {idea.version}, {picked ? "picked from the faculty's list" : "submitted"}{" "}
        by {idea.submittedBy.name} on {formatDate(idea.submittedAt)}.
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

/** The owning faculty's decision on a waiting proposal; a rejection needs feedback for the team. */
export function IdeaReviewForm({
  cycle,
  teamName,
  idea,
  onDone,
}: {
  cycle: Cycle;
  teamName: string;
  idea: Idea;
  /** With the message to show; a failed review usually means the idea changed meanwhile. */
  onDone: (message: string, failed: boolean) => void;
}) {
  const [decision, setDecision] = useState<IdeaDecision>("APPROVED");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  if (idea.status !== "SUBMITTED" || cycle.status !== "PUBLISHED") return null;

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
  );
}
