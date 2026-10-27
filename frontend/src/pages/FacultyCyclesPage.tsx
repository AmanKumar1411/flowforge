import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { closeCycle, listMyCycles, publishCycle } from "../api/cycles";
import { CycleCard, CycleListShell, EmptyState } from "../components/CycleParts";
import { readableError } from "../errors";
import type { Cycle } from "../types";

export function FacultyCyclesPage() {
  const navigate = useNavigate();
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    listMyCycles()
      .then(setCycles)
      .catch((caught) => setError(readableError(caught)));
  }, []);
  const transition = async (cycle: Cycle, action: "publish" | "close") => {
    if (
      !window.confirm(
        `${action === "publish" ? "Publish" : "Close"} this cycle?`,
      )
    )
      return;
    try {
      const updated =
        action === "publish"
          ? await publishCycle(cycle.id)
          : await closeCycle(cycle.id);
      setCycles((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (caught) {
      setError(readableError(caught));
    }
  };
  return (
    <CycleListShell
      eyebrow="Faculty workspace"
      title="Course cycles"
      action={
        <button
          className="primary-button compact"
          onClick={() => navigate("/faculty/cycles/new")}
        >
          + New cycle
        </button>
      }
      error={error}
    >
      {cycles.length === 0 ? (
        <EmptyState
          title="No cycles yet"
          body="Create the academic context your students will work inside."
        />
      ) : (
        <div className="cycle-grid">
          {cycles.map((cycle) => (
            <CycleCard
              key={cycle.id}
              cycle={cycle}
              faculty
              onOpen={() => navigate(`/faculty/cycles/${cycle.id}`)}
              onEdit={() => navigate(`/faculty/cycles/${cycle.id}/edit`)}
              onAction={(action) => transition(cycle, action)}
            />
          ))}
        </div>
      )}
    </CycleListShell>
  );
}
