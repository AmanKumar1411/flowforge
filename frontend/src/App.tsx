import { Navigate, Route, Routes } from "react-router";
import { RequireRole } from "./auth/RequireRole";
import { dashboardFor, useAuth } from "./auth/useAuth";
import { AppShell } from "./components/AppShell";
import { AdminPage } from "./pages/AdminPage";
import { AuthCallbackPage } from "./pages/AuthCallbackPage";
import { CycleDetailPage } from "./pages/CycleDetailPage";
import { CycleEditorPage } from "./pages/CycleEditorPage";
import { FacultyCyclesPage } from "./pages/FacultyCyclesPage";
import { LoginPage } from "./pages/LoginPage";
import { PendingPage } from "./pages/PendingPage";
import { StudentCyclesPage } from "./pages/StudentCyclesPage";
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
                <Route index element={<Navigate to="cycles" replace />} />
                <Route path="cycles" element={<StudentCyclesPage />} />
                <Route
                  path="cycles/:cycleId"
                  element={<CycleDetailPage faculty={false} />}
                />
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
                <Route path="cycles/new" element={<CycleEditorPage />} />
                <Route path="cycles/:cycleId" element={<CycleDetailPage faculty />} />
                <Route path="cycles/:cycleId/edit" element={<CycleEditorPage />} />
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
