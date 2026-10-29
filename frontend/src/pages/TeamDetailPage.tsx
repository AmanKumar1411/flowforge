import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { getCycle } from "../api/cycles";
import { getTeamIdea } from "../api/ideas";
import { listTeamSubmissions } from "../api/submissions";
import { addTeamMember, getCompletionOverview, getTeam } from "../api/teams";
import { IdeaDetails, IdeaReviewForm, IdeaStatusBadge } from "../components/IdeaPanels";
import { SubmissionHistory } from "../components/SubmissionPanels";
import { MemberList } from "../components/TeamPanels";
import { formatDay } from "../dates";
import { readableError } from "../errors";
import { submissionWindow } from "../ideas";
import type { CompletionOverview, Cycle, Idea, Submission, Team, TeamOrigin } from "../types";

const FORMED_BY: Record<TeamOrigin, string> = {
  STUDENT: "Formed by the students",
  FACULTY: "Formed by faculty",
  AUTO_GROUP: "Auto-grouped by faculty",
};

interface Loaded {
  cycle: Cycle;
  team: Team;
  idea: Idea | null;
  /** Each milestone's versions, in milestone order. */
  versions: Submission[][];
  /** Only while the cycle is published. */
  overview: CompletionOverview | null;
}

/**
 * One team, for the cycle's faculty: its members, its idea (a pick from the
 * list, or the proposal as submitted with every review), and every version of
 * its work. Reviewing the proposal and placing students happen here.
 */
export function TeamDetailPage() {
  const { cycleId = "", teamId = "" } = useParams();
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [version, setVersion] = useState(0);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let live = true;
    (async () => {
      const [cycle, team, idea] = await Promise.all([
        getCycle(cycleId),
        getTeam(teamId),
        getTeamIdea(teamId),
      ]);
      if (team.cycleId !== cycle.id) throw new Error("This team belongs to another project.");
      const versions = await Promise.all(
        cycle.milestones.map((milestone) => listTeamSubmissions(teamId, milestone.id)),
      );
      const overview = cycle.status === "PUBLISHED" ? await getCompletionOverview(cycle.id) : null;
      if (live) setLoaded({ cycle, team, idea, versions, overview });
    })().catch((caught) => live && setError(readableError(caught)));
    return () => {
      live = false;
    };
  }, [cycleId, teamId, version]);

  const back = () => navigate(`/faculty/cycles/${cycleId}`);
  if (error) {
    return (
      <section className="detail-page">
        <button className="back-button" onClick={back}>
          ← Back to the project
        </button>
        <p className="form-error banner">{error}</p>
      </section>
    );
  }
  if (!loaded) return <p className="loading">Loading team…</p>;

  const { cycle, team, idea, versions, overview } = loaded;
  // After a review or a placement, or a failed one (the team may have changed meanwhile), load it again.
  const reload = (message: string, failed = false) => {
    setNotice(failed ? "" : message);
    setActionError(failed ? message : "");
    setVersion((current) => current + 1);
  };

  return (
    <section className="detail-page">
      <button className="back-button" onClick={back}>
        ← Back to {cycle.title}
      </button>
      <header className="cycle-header">
        <div className="cycle-heading">
          <p className="cycle-kicker">
            <span className="eyebrow">
              Team · {cycle.courseName} / {cycle.title}
            </span>
          </p>
          <h1>{team.name}</h1>
          <p className="cycle-facts">
            {team.members.length}/{cycle.maxTeamSize} members · {FORMED_BY[team.origin]} on{" "}
            {formatDay(team.createdAt)}
          </p>
        </div>
      </header>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {actionError && (
        <p className="form-error banner" role="alert">
          {actionError}
        </p>
      )}
      <div className="cycle-layout side-first">
        <div className="cycle-main">
          <section className="team-panel" aria-labelledby="team-idea-heading">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Project idea</p>
                <h2 id="team-idea-heading">{idea ? idea.title : "No idea yet"}</h2>
              </div>
              {idea && <IdeaStatusBadge idea={idea} />}
            </div>
            {idea ? (
              <>
                <IdeaDetails idea={idea} />
                <IdeaReviewForm
                  key={`${idea.version}-${idea.status}`}
                  cycle={cycle}
                  teamName={team.name}
                  idea={idea}
                  onDone={reload}
                />
              </>
            ) : (
              <p className="muted">
                The team has not picked an idea from your list or proposed its own yet.
              </p>
            )}
          </section>
          {cycle.milestones.map((milestone, index) => {
            const history = versions[index] ?? [];
            const closed = submissionWindow(cycle, milestone, now) === "CLOSED";
            const headingId = `team-work-heading-${milestone.id}`;
            return (
              <section key={milestone.id} className="team-panel" aria-labelledby={headingId}>
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">M{milestone.position} · due {formatDay(milestone.submissionDueAt)}</p>
                    <h2 id={headingId}>
                      {milestone.name}:{" "}
                      {history.length === 0
                        ? "nothing submitted yet"
                        : `${history.length} ${history.length === 1 ? "version" : "versions"}`}
                    </h2>
                  </div>
                </div>
                {history.length === 0 ? (
                  <p className="muted">
                    {closed
                      ? "The team submitted no work for this milestone."
                      : idea?.status === "APPROVED"
                        ? "Any member can submit while the milestone is open; every submission is a new version."
                        : "The team can submit work once its idea is approved or picked from your list."}
                  </p>
                ) : (
                  <SubmissionHistory versions={history} latestLabel={closed ? "Final" : "Latest"} />
                )}
              </section>
            );
          })}
        </div>
        <aside className="cycle-side" aria-label="Members">
          <section className="side-card" aria-labelledby="members-heading">
            <h2 id="members-heading">Members</h2>
            <MemberList team={team} />
            <PlaceStudent cycle={cycle} team={team} overview={overview} now={now} onAdded={reload} />
          </section>
        </aside>
      </div>
    </section>
  );
}

/** During the faculty's window, a student without a team can join this team if it has room. */
function PlaceStudent({
  cycle,
  team,
  overview,
  now,
  onAdded,
}: {
  cycle: Cycle;
  team: Team;
  overview: CompletionOverview | null;
  now: number;
  onAdded: (message: string, failed?: boolean) => void;
}) {
  const [studentId, setStudentId] = useState("");
  const [busy, setBusy] = useState(false);
  if (!overview?.open) {
    const ahead =
      cycle.status === "PUBLISHED" &&
      now < Date.parse(cycle.teamDeadline);
    return ahead ? (
      <p className="field-hint">
        During your time to place students, you can add students without a team here.
      </p>
    ) : null;
  }
  if (team.members.length >= cycle.maxTeamSize) {
    return <p className="field-hint">The team is full, so no one can be added.</p>;
  }
  if (overview.unassigned.length === 0) {
    return <p className="field-hint">Every student is in a team.</p>;
  }
  const add = async (event: FormEvent) => {
    event.preventDefault();
    const student = overview.unassigned.find((entry) => entry.id === studentId);
    if (!student) return;
    setBusy(true);
    try {
      await addTeamMember(team.id, student.id);
      setStudentId("");
      onAdded(`Added ${student.name} to ${team.name}.`);
    } catch (caught) {
      onAdded(readableError(caught), true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="place-student" onSubmit={add}>
      <label>
        Add a student without a team
        <select value={studentId} onChange={(event) => setStudentId(event.target.value)}>
          <option value="">Choose a student…</option>
          {overview.unassigned.map((student) => (
            <option key={student.id} value={student.id}>
              {student.name}
            </option>
          ))}
        </select>
      </label>
      <button className="dark-button compact" disabled={busy || !studentId}>
        Add to {team.name}
      </button>
    </form>
  );
}
