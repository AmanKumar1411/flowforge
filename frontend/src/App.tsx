import { Navigate, Route, Routes } from "react-router";
import { RequireRole } from "./auth/RequireRole";
import { dashboardFor, useAuth } from "./auth/useAuth";
import { AppShell } from "./components/AppShell";
import { AdminPage } from "./pages/AdminPage";
import { AuthCallbackPage } from "./pages/AuthCallbackPage";
import { CycleDetailPage } from "./pages/CycleDetailPage";
import { CycleStudentsPage } from "./pages/CycleStudentsPage";
import { CycleWizardPage } from "./pages/CycleWizardPage";
import { FacultyCyclesPage } from "./pages/FacultyCyclesPage";
import { LoginPage } from "./pages/LoginPage";
import { PendingPage } from "./pages/PendingPage";
import { StudentDashboardPage } from "./pages/StudentDashboardPage";
import { OldProjectLink, StudentProjectPage } from "./pages/StudentProjectPage";
import { TeamDetailPage } from "./pages/TeamDetailPage";
import "./App.css";

function Home() {
  const { state } = useAuth();
  if (state.status === "loading") {
    return <p className="loading page-loading">Checking your session…</p>;
  }
  return (
    <Navigate
      to={state.status === "signed-in" ? dashboardFor(state.user) : "/login"}
      replace
    />
  );
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route
        path="/pending"
        element={
          <RequireRole roles={["PENDING_STAFF"]}>
            <PendingPage />
          </RequireRole>
        }
      />
      <Route element={<AppShell />}>
        <Route
          path="/student/*"
          element={
            <RequireRole roles={["STUDENT"]}>
              <Routes>
                <Route index element={<StudentDashboardPage />} />
                <Route path="projects/:cycleId" element={<StudentProjectPage />} />
                {/* Phase 9: the old project links still work. */}
                <Route path="cycles" element={<Navigate to="/student" replace />} />
                <Route path="cycles/:cycleId" element={<OldProjectLink />} />
              </Routes>
            </RequireRole>
          }
        />
        <Route
          path="/faculty/*"
          element={
            <RequireRole roles={["FACULTY"]}>
              <Routes>
                <Route index element={<Navigate to="cycles" replace />} />
                <Route path="cycles" element={<FacultyCyclesPage />} />
                <Route path="cycles/new" element={<CycleWizardPage />} />
                <Route path="cycles/:cycleId" element={<CycleDetailPage faculty />} />
                <Route path="cycles/:cycleId/edit" element={<CycleWizardPage />} />
                <Route path="cycles/:cycleId/students" element={<CycleStudentsPage />} />
                <Route path="cycles/:cycleId/teams/:teamId" element={<TeamDetailPage />} />
              </Routes>
            </RequireRole>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireRole roles={["ADMIN"]}>
              <AdminPage />
            </RequireRole>
          }
        />
      </Route>
      <Route path="*" element={<Home />} />
    </Routes>
  );
}

export default App;
