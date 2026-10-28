import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  createTeam,
  disbandTeam,
  listCycleTeams,
  listSeekers,
  searchTeamCandidates,
  startLooking,
  stopLooking,
  updateTeam,
} from "../api/teams";
import { useAuth } from "../auth/useAuth";
import { formatDate } from "../dates";
import { readableError } from "../errors";
import {
  cleanSearch,
  describeTeamSize,
  hasCompletionWindow,
  isCompletionOpen,
  isFormationOpen,
} from "../teams";
import type { Cycle, Person, Team, TeamCandidate } from "../types";
import { TeamIdeaPanel } from "./IdeaPanels";

export function FormationNote({ cycle, now }: { cycle: Cycle; now: number }) {
  const deadline = formatDate(cycle.teamFormationDeadline);
  let completion = "";
  if (hasCompletionWindow(cycle)) {
    completion =
      cycle.status === "PUBLISHED" &&
      now < Date.parse(cycle.teamCompletionDeadline)
        ? `The faculty place anyone still without a team by ${formatDate(cycle.teamCompletionDeadline)}.`
        : "The faculty's time to place students without a team has ended.";
  }
  return (
    <p className="field-hint">
      {describeTeamSize(cycle)} members, leader included.{" "}
      {isFormationOpen(cycle, now)
        ? `Students can change their teams until ${deadline}.`
        : `Students' own changes ended${cycle.status === "CLOSED" ? "" : ` on ${deadline}`}.`}{" "}
      {completion}
    </p>
  );
}

/** A student the faculty registered from a list, who has not signed in yet; they can still join a team. */
export function NotSignedInTag() {
  return <span className="pending-tag">Not signed in yet</span>;
}

export function MemberList({ team }: { team: Team }) {
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
    <>
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
        <FormationNote cycle={cycle} now={now} />
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
          <>
            <div className="team-empty">
              <p>
                Create a team to become its leader and pick your teammates, or
                wait for a leader to add you. Added students join at once.
              </p>
              <button
                className="primary-button"
                onClick={() => setEditing(true)}
              >
                Create a team
              </button>
            </div>
            <LookingSwitch cycleId={cycle.id} myId={myId} />
          </>
        ) : (
          team === null && (
            <p className="muted">
              {isCompletionOpen(cycle, now)
                ? `You are not in a team yet. Your faculty will place you in one by ${formatDate(cycle.teamCompletionDeadline)}.`
                : "You are not in a team for this cycle. Contact your faculty."}
            </p>
          )
        )}
      </section>
      {team && !editing && (
        <TeamIdeaPanel cycle={cycle} team={team} myId={myId} />
      )}
    </>
  );
}

/** "Looking for a team": lets leaders find the student. */
function LookingSwitch({ cycleId, myId }: { cycleId: string; myId: string }) {
  const [mine, setMine] = useState<TeamCandidate | null | undefined>(
    undefined,
  );
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(() => {
    listSeekers(cycleId)
      .then((seekers) =>
        setMine(seekers.find((seeker) => seeker.id === myId) ?? null),
      )
      .catch((caught) => setError(readableError(caught)));
  }, [cycleId, myId]);
  useEffect(load, [load]);

  const act = async (work: () => Promise<void>) => {
    setError("");
    try {
      await work();
      load();
    } catch (caught) {
      setError(readableError(caught));
    }
  };

  if (mine === undefined) return null;
  return (
    <div className="looking-box">
      {mine ? (
        <>
          <p>
            <strong>You are listed as looking for a team.</strong>{" "}
            {mine.note && `“${mine.note}”. `}Leaders and your faculty can see
            this.
          </p>
          <button
            className="text-button"
            onClick={() => act(() => stopLooking(cycleId))}
          >
            Stop looking
          </button>
        </>
      ) : (
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void act(() => startLooking(cycleId, note));
          }}
        >
          <label>
            Note for leaders (optional)
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. good at backend, free on weekends"
              maxLength={200}
            />
          </label>
          <button className="dark-button compact">
            I'm looking for a team
          </button>
        </form>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

function CandidateRow({
  candidate,
  action,
}: {
  candidate: TeamCandidate;
  action: ReactNode;
}) {
  return (
    <li>
      <span>
        <strong>
          {candidate.name}
          {candidate.lookingForTeam && (
            <span className="looking-tag">Looking</span>
          )}
          {!candidate.signedIn && <NotSignedInTag />}
        </strong>
        <small>{candidate.note ?? candidate.email}</small>
      </span>
      {action}
    </li>
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
  const [seekers, setSeekers] = useState<TeamCandidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const search = cleanSearch(query);
  const size = selected.length + 1;
  const sizeOk = size >= cycle.minTeamSize && size <= cycle.maxTeamSize;

  useEffect(() => {
    listSeekers(cycle.id)
      .then(setSeekers)
      .catch((caught) => setError(readableError(caught)));
  }, [cycle.id]);

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
  const { state } = useAuth();
  const myId = state.status === "signed-in" ? state.user.id : "";
  const lookingOthers = seekers.filter((seeker) => seeker.id !== myId);
  const addButton = (candidate: TeamCandidate) => {
    const chosen = selected.some((person) => person.id === candidate.id);
    const taken = candidate.availability === "IN_ANOTHER_TEAM";
    return (
      <button
        type="button"
        className="text-button"
        disabled={chosen || taken || size >= cycle.maxTeamSize}
        onClick={() => add(candidate)}
      >
        {taken ? "Already in a team" : chosen ? "Added" : "Add"}
      </button>
    );
  };
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
          {candidates.map((candidate) => (
            <CandidateRow
              key={candidate.id}
              candidate={candidate}
              action={addButton(candidate)}
            />
          ))}
        </ul>
      )}
      {search.length < 2 && lookingOthers.length > 0 && (
        <>
          <h3 className="member-count">Looking for a team</h3>
          <ul className="candidate-list" aria-label="Looking for a team">
            {lookingOthers.map((candidate) => (
              <CandidateRow
                key={candidate.id}
                candidate={candidate}
                action={addButton(candidate)}
              />
            ))}
          </ul>
        </>
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
