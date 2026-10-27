import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { getCycle } from "../api/cycles";
import { Info } from "../components/CycleParts";
import { EnrollmentPanel } from "../components/EnrollmentPanel";
import { FacultyTeamsSection } from "../components/FacultyTeamPanels";
import { StudentTeamPanel } from "../components/TeamPanels";
import { formatDate } from "../dates";
import { readableError } from "../errors";
import { describeTeamSize } from "../teams";
import type { Cycle } from "../types";

export function CycleDetailPage({ faculty }: { faculty: boolean }) {
  const { cycleId = "" } = useParams();
  const navigate = useNavigate();
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [error, setError] = useState("");
  const backTo = faculty ? "/faculty/cycles" : "/student/cycles";
  useEffect(() => {
    getCycle(cycleId)
      .then(setCycle)
      .catch((caught) => setError(readableError(caught)));
  }, [cycleId]);
  if (error)
    return (
      <section>
        <button className="back-button" onClick={() => navigate(backTo)}>
          ← Back
        </button>
        <p className="form-error banner">{error}</p>
      </section>
    );
  if (!cycle) return <p className="loading">Loading cycle…</p>;
  return (
    <section className="detail-page">
      <button className="back-button" onClick={() => navigate(backTo)}>
        ← Back to cycles
      </button>
      <div className="detail-header">
        <div>
          <span className={`status status-${cycle.status.toLowerCase()}`}>
            {cycle.status === "PUBLISHED" ? "Open" : cycle.status}
          </span>
          <p className="eyebrow">
            {cycle.courseName} / Batch {cycle.batchYear}
            {cycle.kind === "ELECTIVE" && " / Elective"}
          </p>
          <h1>{cycle.title}</h1>
          <p>{cycle.description || "No description added."}</p>
        </div>
        {faculty && cycle.status === "DRAFT" && (
          <button
            className="primary-button"
            onClick={() => navigate(`/faculty/cycles/${cycle.id}/edit`)}
          >
            Edit cycle
          </button>
        )}
      </div>
      <div className="detail-grid">
        <Info label="Semester" value={`Semester ${cycle.semester}`} />
        <Info label="Academic year" value={cycle.academicYear} />
        <Info
          label="Course type"
          value={cycle.kind === "ELECTIVE" ? "Elective" : "Core (whole batch)"}
        />
        <Info label="Team size" value={`${describeTeamSize(cycle)} members`} />
        <Info
          label="Students form teams until"
          value={formatDate(cycle.teamFormationDeadline)}
        />
        <Info
          label="Faculty complete teams by"
          value={formatDate(cycle.teamCompletionDeadline)}
        />
        <Info
          label="Submissions open"
          value={formatDate(cycle.submissionStartAt)}
        />
        <Info label="Deadline" value={formatDate(cycle.submissionDeadline)} />
      </div>
      {faculty ? (
        <>
          {cycle.kind === "ELECTIVE" && <EnrollmentPanel cycle={cycle} />}
          {cycle.status !== "DRAFT" && <FacultyTeamsSection cycle={cycle} />}
        </>
      ) : (
        <StudentTeamPanel cycle={cycle} />
      )}
    </section>
  );
}
