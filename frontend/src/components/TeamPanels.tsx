import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  createTeam,
  disbandTeam,
  listCycleTeams,
  searchTeamCandidates,
  updateTeam,
} from "../api/teams";
import { useAuth } from "../auth/useAuth";
import { formatDate } from "../dates";
import { readableError } from "../errors";
import { cleanSearch, describeTeamSize, isFormationOpen } from "../teams";
import type { Cycle, Team, TeamCandidate } from "../types";

type Person = { id: string; name: string; email: string };

function FormationNote({ cycle, open }: { cycle: Cycle; open: boolean }) {
  const deadline = formatDate(cycle.teamFormationDeadline);
  return (
    <p className="field-hint">
      {describeTeamSize(cycle)} members, leader included.{" "}
      {open
        ? `Teams can change until ${deadline}; after that they are fixed.`
        : `Teams are fixed${cycle.status === "CLOSED" ? "" : ` since ${deadline}`}.`}
    </p>
  );
}

function MemberList({ team }: { team: Team }) {
  return (
    <ul className="member-list">
      {team.members.map((member) => (
        <li key={member.userId}>
          <span>
            <strong>{member.name}</strong>
            <small>{member.email}</small>
          </span>
          {member.isLeader && <span className="leader-chip">Leader</span>}
        </li>
      ))}
    </ul>
  );
}

/** A student's team in one cycle: view it, or create and edit it as the leader. */
export function StudentTeamPanel({ cycle }: { cycle: Cycle }) {
  const { state } = useAuth();
  const myId = state.status === "signed-in" ? state.user.id : "";
  const [team, setTeam] = useState<Team | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [now] = useState(() => Date.now());
  const open = isFormationOpen(cycle, now);

  const load = useCallback(() => {
    listCycleTeams(cycle.id)
      .then((teams) => setTeam(teams[0] ?? null))
      .catch((caught) => setError(readableError(caught)));
  }, [cycle.id]);
  useEffect(load, [load]);

  const disband = async () => {
    if (!team) return;
    if (
      !window.confirm(
        `Disband ${team.name}? Every member becomes free to join another team.`,
      )
    )
      return;
    setError("");
    try {
      await disbandTeam(team.id);
      setTeam(null);
    } catch (caught) {
      setError(readableError(caught));
    }
  };

  const leader = team?.members.find((member) => member.isLeader);
  return (
    <section className="team-panel" aria-labelledby="team-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Your team</p>
          <h2 id="team-heading">
            {team === undefined ? "Loading…" : (team?.name ?? "No team yet")}
          </h2>
        </div>
        {team && !editing && open && team.leaderId === myId && (
          <div className="row-actions">
            <button className="text-button" onClick={disband}>
              Disband
            </button>
            <button
              className="dark-button compact"
              onClick={() => setEditing(true)}
            >
              Edit team
            </button>
          </div>
        )}
      </div>
      <FormationNote cycle={cycle} open={open} />
      {error && <p className="form-error">{error}</p>}
      {editing ? (
        <TeamEditor
          cycle={cycle}
          team={team ?? null}
          onSaved={(saved) => {
            setTeam(saved);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : team ? (
        <>
          <MemberList team={team} />
          {team.leaderId !== myId && (
            <p className="muted">
              {leader?.name ?? "The leader"} leads this team. Only the leader
              can change it.
            </p>
          )}
        </>
      ) : team === null && open ? (
        <div className="team-empty">
          <p>
            Create a team to become its leader and pick your teammates, or wait
            for a leader to add you. Added students join at once.
          </p>
          <button className="primary-button" onClick={() => setEditing(true)}>
            Create a team
          </button>
        </div>
      ) : (
        team === null && (
          <p className="muted">
            You are not in a team for this cycle. Contact your faculty.
          </p>
        )
      )}
    </section>
  );
}

/** Create (no team) or edit (team) form. The caller is always the leader. */
function TeamEditor({
  cycle,
  team,
  onSaved,
  onCancel,
}: {
  cycle: Cycle;
  team: Team | null;
  onSaved: (team: Team) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(team?.name ?? "");
  const [selected, setSelected] = useState<Person[]>(
    team?.members
      .filter((member) => !member.isLeader)
      .map(({ userId, name, email }) => ({ id: userId, name, email })) ?? [],
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TeamCandidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const search = cleanSearch(query);
  const size = selected.length + 1;
  const sizeOk = size >= cycle.minTeamSize && size <= cycle.maxTeamSize;

  useEffect(() => {
    if (search.length < 2) return;
    let current = true;
    const timer = window.setTimeout(() => {
      searchTeamCandidates(cycle.id, search)
        .then((found) => current && setResults(found))
        .catch((caught) => current && setError(readableError(caught)));
    }, 250);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [cycle.id, search]);

  const add = (person: Person) =>
    setSelected((current) => [...current, person]);
  const remove = (id: string) =>
    setSelected((current) => current.filter((person) => person.id !== id));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const input = {
      name: name.trim(),
      memberIds: selected.map((person) => person.id),
    };
    try {
      onSaved(
        team
          ? await updateTeam(team.id, input)
          : await createTeam(cycle.id, input),
      );
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setBusy(false);
    }
  };

  const candidates = search.length >= 2 ? results : [];
  return (
    <form className="team-editor" onSubmit={submit}>
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
        Find batch-mates
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name or email, at least 2 letters"
        />
      </label>
      {candidates.length > 0 && (
        <ul className="candidate-list" aria-label="Search results">
          {candidates.map((candidate) => {
            const chosen = selected.some((person) => person.id === candidate.id);
            const taken = candidate.availability === "IN_ANOTHER_TEAM";
            return (
              <li key={candidate.id}>
                <span>
                  <strong>{candidate.name}</strong>
                  <small>{candidate.email}</small>
                </span>
                <button
                  type="button"
                  className="text-button"
                  disabled={chosen || taken || size >= cycle.maxTeamSize}
                  onClick={() => add(candidate)}
                >
                  {taken ? "Already in a team" : chosen ? "Added" : "Add"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {search.length >= 2 && candidates.length === 0 && (
        <p className="muted">No batch-mate matches “{search}”.</p>
      )}
      <h3 className={sizeOk ? "member-count" : "member-count out-of-range"}>
        Members: {size} (allowed: {describeTeamSize(cycle).toLowerCase()})
      </h3>
      <ul className="member-list">
        <li>
          <span>
            <strong>You</strong>
          </span>
          <span className="leader-chip">Leader</span>
        </li>
        {selected.map((person) => (
          <li key={person.id}>
            <span>
              <strong>{person.name}</strong>
              <small>{person.email}</small>
            </span>
            <button
              type="button"
              className="text-button"
              aria-label={`Remove ${person.name}`}
              onClick={() => remove(person.id)}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button type="button" className="text-button" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="primary-button"
          disabled={busy || !sizeOk || !name.trim()}
        >
          {busy ? "Saving…" : team ? "Save team" : "Create team"}
        </button>
      </div>
    </form>
  );
}

/** Every team of a cycle, read-only: for the owning faculty. */
export function CycleTeamsPanel({ cycle }: { cycle: Cycle }) {
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [error, setError] = useState("");
  const [now] = useState(() => Date.now());
  useEffect(() => {
    listCycleTeams(cycle.id)
      .then(setTeams)
      .catch((caught) => setError(readableError(caught)));
  }, [cycle.id]);

  return (
    <section className="team-panel" aria-labelledby="teams-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Teams</p>
          <h2 id="teams-heading">
            {teams ? `${teams.length} team${teams.length === 1 ? "" : "s"}` : "Loading…"}
          </h2>
        </div>
      </div>
      <FormationNote cycle={cycle} open={isFormationOpen(cycle, now)} />
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
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => (
              <tr key={team.id}>
                <td>{team.name}</td>
                <td>{team.members.find((member) => member.isLeader)?.name}</td>
                <td>
                  {team.members
                    .filter((member) => !member.isLeader)
                    .map((member) => member.name)
                    .join(", ") || "—"}
                </td>
                <td>{team.members.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
