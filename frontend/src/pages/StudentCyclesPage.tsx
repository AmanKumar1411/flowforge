import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { listCycles } from "../api/cycles";
import { listMyTeams } from "../api/teams";
import { useAuth } from "../auth/useAuth";
import { CycleCard, CycleListShell, EmptyState } from "../components/CycleParts";
import { readableError } from "../errors";
import { isFormationOpen } from "../teams";
import type { Cycle, Team } from "../types";

export function StudentCyclesPage() {
  const navigate = useNavigate();
  const { state } = useAuth();
  const user = state.status === "signed-in" ? state.user : null;
  const batchYear = user?.batchYear ?? null;
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [error, setError] = useState("");
  const [now] = useState(() => Date.now());
  useEffect(() => {
    Promise.all([listCycles(), listMyTeams()])
      .then(([loadedCycles, loadedTeams]) => {
        setCycles(loadedCycles);
        setTeams(loadedTeams);
      })
      .catch((caught) => setError(readableError(caught)));
  }, []);
  // A leader may have added this student: the card says so without any action on their part.
  const tagFor = (cycle: Cycle) => {
    const team = teams.find((candidate) => candidate.cycleId === cycle.id);
    if (team) {
      return `Team ${team.name}${team.leaderId === user?.id ? " · you lead it" : ""}`;
    }
    return isFormationOpen(cycle, now) ? "No team yet" : undefined;
  };
  return (
    <CycleListShell
      eyebrow={`Student workspace / Batch ${batchYear ?? "unassigned"}`}
      title="Open cycles"
      error={error}
    >
      {cycles.length === 0 ? (
        <EmptyState
          title="Nothing open for your batch"
          body="Published course cycles for your cohort will appear here."
        />
      ) : (
        <div className="cycle-grid">
          {cycles.map((cycle) => (
            <CycleCard
              key={cycle.id}
              cycle={cycle}
              tag={tagFor(cycle)}
              onOpen={() => navigate(`/student/cycles/${cycle.id}`)}
            />
          ))}
        </div>
      )}
    </CycleListShell>
  );
}
