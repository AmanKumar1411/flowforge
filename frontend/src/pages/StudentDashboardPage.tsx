import { useEffect, useState } from "react";
import { getDashboard } from "../api/dashboard";
import { useAuth } from "../auth/useAuth";
import { ProjectCardView, UpdatesList, UpNextList } from "../components/student/DashboardPanels";
import { readableError } from "../errors";
import type { StudentDashboard } from "../types";

/** The student's home (Phase 9): what to do next, what changed, and their projects. */
export function StudentDashboardPage() {
  const { state } = useAuth();
  const user = state.status === "signed-in" ? state.user : null;
  const [dashboard, setDashboard] = useState<StudentDashboard | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    getDashboard()
      .then(setDashboard)
      .catch((caught) => setError(readableError(caught)));
  }, []);

  return (
    <section className="dashboard-page">
      <p className="eyebrow">Student workspace / Batch {user?.batchYear ?? "unassigned"}</p>
      <h1>Your projects</h1>
      {error && <p className="form-error banner">{error}</p>}
      {!dashboard && !error && <p className="loading">Loading…</p>}
      {dashboard && (
        <div className="cycle-layout dashboard-layout">
          <div className="cycle-main">
            {dashboard.projects.active.length === 0 ? (
              <div className="empty-state">
                <h2>No open projects yet</h2>
                <p>When your faculty publish a project for your batch, or enroll you in an elective, it appears here.</p>
              </div>
            ) : (
              <div className="cycle-grid">
                {dashboard.projects.active.map((project) => (
                  <ProjectCardView key={project.cycle.id} project={project} />
                ))}
              </div>
            )}
            {dashboard.projects.past.length > 0 && (
              <details className="past-projects">
                <summary>Past projects ({dashboard.projects.past.length})</summary>
                <div className="cycle-grid">
                  {dashboard.projects.past.map((project) => (
                    <ProjectCardView key={project.cycle.id} project={project} />
                  ))}
                </div>
              </details>
            )}
          </div>
          <aside className="cycle-side" aria-label="What is happening">
            <UpNextList items={dashboard.upNext} />
            <UpdatesList updates={dashboard.updates} />
          </aside>
        </div>
      )}
    </section>
  );
}
