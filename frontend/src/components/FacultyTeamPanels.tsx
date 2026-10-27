import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  addTeamMember,
  applyAutoGroup,
  createFacultyTeam,
  getCompletionOverview,
  listCycleTeams,
  previewAutoGroup,
} from "../api/teams";
import { formatDate } from "../dates";
import { readableError } from "../errors";
import {
  describeTeamSize,
  hasCompletionWindow,
  isFormationOpen,
  originLabel,
} from "../teams";
import type {
  AutoGroupPreview,
  CompletionOverview,
  Cycle,
  Team,
  UnassignedStudent,
} from "../types";
import { FormationNote } from "./TeamPanels";

/** The owning faculty's view of a cycle's teams, and their tools for students left without one. */
export function FacultyTeamsSection({ cycle }: { cycle: Cycle }) {
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [overview, setOverview] = useState<CompletionOverview | null>(null);
  const [error, setError] = useState("");
  const [now] = useState(() => Date.now());

  const load = useCallback(() => {
    Promise.all([listCycleTeams(cycle.id), getCompletionOverview(cycle.id)])
      .then(([loadedTeams, loadedOverview]) => {
        setTeams(loadedTeams);
        setOverview(loadedOverview);
      })
      .catch((caught) => setError(readableError(caught)));
  }, [cycle.id]);
  useEffect(load, [load]);

  return (
    <>
      <section className="team-panel" aria-labelledby="teams-heading">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Teams</p>
            <h2 id="teams-heading">
              {teams
                ? `${teams.length} team${teams.length === 1 ? "" : "s"}`
                : "Loading…"}
            </h2>
          </div>
        </div>
        <FormationNote cycle={cycle} now={now} />
        {error && <p className="form-error">{error}</p>}
        {teams && teams.length === 0 && (
          <p className="muted">No team has been formed yet.</p>
        )}
        {teams && teams.length > 0 && (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Team</th>
                <th>Leader</th>
                <th>Members</th>
                <th>Size</th>
                <th>Formed by</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((team) => (
                <tr key={team.id}>
                  <td>{team.name}</td>
                  <td>
                    {team.members.find((member) => member.isLeader)?.name}
                  </td>
                  <td>
                    {team.members
                      .filter((member) => !member.isLeader)
                      .map((member) => member.name)
                      .join(", ") || "—"}
                  </td>
                  <td>{team.members.length}</td>
                  <td>{originLabel(team.origin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {teams && overview && (
        <CompletionPanel
          cycle={cycle}
          teams={teams}
          overview={overview}
          now={now}
          onChanged={load}
        />
      )}
    </>
  );
}

function CompletionStatus({
  cycle,
  open,
  now,
}: {
  cycle: Cycle;
  open: boolean;
  now: number;
}) {
  const formationEnds = formatDate(cycle.teamFormationDeadline);
  const completionEnds = formatDate(cycle.teamCompletionDeadline);
  let text: string;
  if (open) {
    text = `Students can no longer change teams. Place everyone still without a team by ${completionEnds}: build a team from selected students, add a student to a team with room, or auto-group the rest at random.`;
  } else if (cycle.status === "PUBLISHED" && isFormationOpen(cycle, now)) {
    text = hasCompletionWindow(cycle)
      ? `Students are forming their own teams until ${formationEnds}. From then until ${completionEnds} you can place everyone still without a team.`
      : `Students are forming their own teams until ${formationEnds}. To place students left without a team afterwards, set a team completion deadline later than that.`;
  } else {
    text = "Teams are final.";
  }
  return <p className="field-hint">{text}</p>;
}

function CompletionPanel({
  cycle,
  teams,
  overview,
  now,
  onChanged,
}: {
  cycle: Cycle;
  teams: Team[];
  overview: CompletionOverview;
  now: number;
  onChanged: () => void;
}) {
  const [selection, setSelection] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [leaderChoice, setLeaderChoice] = useState("");
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<AutoGroupPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { open, unassigned, notSignedIn } = overview;
  // Students placed some other way since they were ticked (Add, auto-group) drop out of the selection.
  const selected = selection.filter((id) =>
    unassigned.some((student) => student.id === id),
  );
  const withRoom = teams.filter(
    (team) => team.members.length < cycle.maxTeamSize,
  );
  const leaderId = selected.includes(leaderChoice)
    ? leaderChoice
    : (selected[0] ?? "");
  const sizeOk =
    selected.length >= cycle.minTeamSize &&
    selected.length <= cycle.maxTeamSize;
  const nameOf = (id: string) =>
    unassigned.find((student) => student.id === id)?.name ?? "";

  const run = async (work: () => Promise<string>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setNotice(await work());
      onChanged();
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) =>
    setSelection((current) =>
      current.includes(id)
        ? current.filter((other) => other !== id)
        : [...current, id],
    );

  const createFromSelected = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const team = await createFacultyTeam(cycle.id, {
        name: name.trim(),
        leaderId,
        memberIds: selected.filter((id) => id !== leaderId),
      });
      setSelection([]);
      setName("");
      return `Created ${team.name}.`;
    });
  };

  const addTo = (student: UnassignedStudent) =>
    run(async () => {
      const team = await addTeamMember(targets[student.id], student.id);
      return `Added ${student.name} to ${team.name}.`;
    });

  const roll = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setPreview(await previewAutoGroup(cycle.id));
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setBusy(false);
    }
  };

  const confirmPreview = (proposal: AutoGroupPreview) =>
    run(async () => {
      const created = await applyAutoGroup(
        cycle.id,
        proposal.teams.map((team) => ({
          name: team.name,
          leaderId: team.leader.id,
          memberIds: team.members.map((member) => member.id),
        })),
      );
      setPreview(null);
      return `Created ${created.length} team${created.length === 1 ? "" : "s"}.`;
    });

  return (
    <section className="team-panel" aria-labelledby="unassigned-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Team completion</p>
          <h2 id="unassigned-heading">
            Students without a team ({unassigned.length})
          </h2>
        </div>
        {open && unassigned.length > 0 && !preview && (
          <button
            className="dark-button compact"
            disabled={busy}
            onClick={roll}
          >
            Auto-group the rest
          </button>
        )}
      </div>
      <CompletionStatus cycle={cycle} open={open} now={now} />
      {error && <p className="form-error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {preview && (
        <div className="proposal" aria-label="Auto-group proposal">
          <h3 className="member-count">
            Proposed teams ({describeTeamSize(cycle).toLowerCase()} members
            each, leaders picked at random)
          </h3>
          {preview.teams.length === 0 && (
            <p className="muted">No valid team can be formed from these students.</p>
          )}
          <div className="proposal-grid">
            {preview.teams.map((team) => (
              <article className="proposal-card" key={team.name}>
                <h4>{team.name}</h4>
                <ul>
                  <li>
                    {team.leader.name} <span className="leader-chip">Leader</span>
                  </li>
                  {team.members.map((member) => (
                    <li key={member.id}>{member.name}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          {preview.unplaced.length > 0 && (
            <p className="form-error">
              No valid team for:{" "}
              {preview.unplaced.map((person) => person.name).join(", ")}. Add
              them to a team with room afterwards.
            </p>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="text-button"
              onClick={() => setPreview(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={roll}
            >
              Re-roll
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={busy || preview.teams.length === 0}
              onClick={() => confirmPreview(preview)}
            >
              Create these teams
            </button>
          </div>
        </div>
      )}

      {unassigned.length === 0 ? (
        <p className="muted">Every student is in a team.</p>
      ) : (
        <ul className="member-list completion-list">
          {unassigned.map((student) => (
            <li key={student.id}>
              <label className="select-student">
                {open && (
                  <input
                    type="checkbox"
                    checked={selected.includes(student.id)}
                    onChange={() => toggle(student.id)}
                  />
                )}
                <span>
                  <strong>
                    {student.name}
                    {student.lookingForTeam && (
                      <span className="looking-tag">Looking</span>
                    )}
                  </strong>
                  <small>{student.note ?? student.email}</small>
                </span>
              </label>
              {open && withRoom.length > 0 && (
                <span className="row-actions">
                  <select
                    aria-label={`Team for ${student.name}`}
                    value={targets[student.id] ?? ""}
                    onChange={(event) =>
                      setTargets((current) => ({
                        ...current,
                        [student.id]: event.target.value,
                      }))
                    }
                  >
                    <option value="">Add to a team…</option>
                    {withRoom.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name} ({team.members.length}/{cycle.maxTeamSize})
                      </option>
                    ))}
                  </select>
                  <button
                    className="text-button"
                    disabled={busy || !targets[student.id]}
                    onClick={() => addTo(student)}
                  >
                    Add
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {open && selected.length > 0 && (
        <form className="team-editor" onSubmit={createFromSelected}>
          <h3
            className={sizeOk ? "member-count" : "member-count out-of-range"}
          >
            New team from {selected.length} selected (allowed:{" "}
            {describeTeamSize(cycle).toLowerCase()})
          </h3>
          <label>
            Team name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={60}
              required
            />
          </label>
          <label>
            Leader
            <select
              value={leaderId}
              onChange={(event) => setLeaderChoice(event.target.value)}
            >
              {selected.map((id) => (
                <option key={id} value={id}>
                  {nameOf(id)}
                </option>
              ))}
            </select>
          </label>
          <div className="form-actions">
            <button
              type="button"
              className="text-button"
              onClick={() => setSelection([])}
            >
              Clear selection
            </button>
            <button
              className="primary-button"
              disabled={busy || !sizeOk || !name.trim()}
            >
              Create team
            </button>
          </div>
        </form>
      )}

      {notSignedIn.length > 0 && (
        <p className="field-hint">
          Enrolled but not signed in yet, so they cannot be placed:{" "}
          {notSignedIn.join(", ")}.
        </p>
      )}
    </section>
  );
}
