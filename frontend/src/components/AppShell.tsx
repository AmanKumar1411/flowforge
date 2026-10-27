import { Outlet, useNavigate } from "react-router";
import { dashboardFor, useAuth } from "../auth/useAuth";

export function AppShell() {
  const { state, signOut, signOutEverywhere } = useAuth();
  const navigate = useNavigate();
  // Without a session, let the route guard inside render: it shows "loading" or redirects to /login.
  if (state.status !== "signed-in") return <Outlet />;
  const { user } = state;

  const leave = async (everywhere: boolean) => {
    await (everywhere ? signOutEverywhere() : signOut());
    navigate("/login", { replace: true });
  };

  return (
    <div className="app-frame">
      <header className="topbar">
        <button className="brand" onClick={() => navigate(dashboardFor(user))}>
          <span className="brand-mark">F</span>
          <span>FlowForge</span>
        </button>
        <div className="account-menu">
          <span>{user.name}</span>
          <span className="role-chip">{user.role.replace("_", " ")}</span>
          <button className="text-button" onClick={() => leave(false)}>
            Sign out
          </button>
          <button
            className="text-button"
            title="End every session on every device"
            onClick={() => leave(true)}
          >
            Sign out everywhere
          </button>
        </div>
      </header>
      <main className="page-content">
        <Outlet />
      </main>
    </div>
  );
}
