import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { getCycle } from "../api/cycles";
import { BatchPanel } from "../components/BatchPanel";
import { EnrollmentPanel } from "../components/EnrollmentPanel";
import { readableError } from "../errors";
import type { Cycle } from "../types";

/** Who takes part in a cycle: an elective's enrolled students, or a core course's batch. */
export function CycleStudentsPage() {
  const { cycleId = "" } = useParams();
  const navigate = useNavigate();
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getCycle(cycleId)
      .then(setCycle)
      .catch((caught) => setError(readableError(caught)));
  }, [cycleId]);

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
  if (!cycle) return <p className="loading">Loading students…</p>;
  const elective = cycle.kind === "ELECTIVE";
  return (
    <section className="detail-page students-page">
      <button className="back-button" onClick={back}>
        ← Back to {cycle.title}
      </button>
      <header className="cycle-header">
        <div className="cycle-heading">
          <p className="cycle-kicker">
            <span className="eyebrow">
              {cycle.courseName} / {cycle.title}
            </span>
          </p>
          <h1>Students</h1>
          <p className="cycle-facts">
            {elective
              ? "Only the students you enroll see this project and can join its teams."
              : `Every student of batch ${cycle.batchYear} takes part. Register those who have not signed in yet, so leaders can add them to teams.`}
          </p>
        </div>
      </header>
      {elective ? <EnrollmentPanel cycle={cycle} /> : <BatchPanel cycle={cycle} />}
    </section>
  );
}
