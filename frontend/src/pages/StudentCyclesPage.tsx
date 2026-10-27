import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { listCycles } from "../api/cycles";
import { useAuth } from "../auth/useAuth";
import { CycleCard, CycleListShell, EmptyState } from "../components/CycleParts";
import { readableError } from "../errors";
import type { Cycle } from "../types";

export function StudentCyclesPage() {
  const navigate = useNavigate();
  const { state } = useAuth();
  const batchYear = state.status === "signed-in" ? state.user.batchYear : null;
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    listCycles()
      .then(setCycles)
      .catch((caught) => setError(readableError(caught)));
  }, []);
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
              onOpen={() => navigate(`/student/cycles/${cycle.id}`)}
            />
          ))}
        </div>
      )}
    </CycleListShell>
  );
}
