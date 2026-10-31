import { Outlet, useNavigate } from "react-router";
import { dashboardFor, useAuth } from "../auth/useAuth";
import { focusTarget } from "../focus";

export function AppShell() {
  const { state, signOut, signOutEverywhere } = useAuth();
  const navigate = useNavigate();
  // Without a session, let the route guard inside render: it shows "loading" or redirects to /login.
  if (state.status !== "signed-in") return <Outlet />;
  const { user } = state;

  const leave = async (everywhere: boolean) => {
    await (everywhere ? signOutEverywhere() : signOut());
    navigate(everywhere ? "/login" : "/login?signedOut=1", { replace: true });
  };

  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content" onClick={(event) => focusTarget(event, "main-content")}>
        Skip to main content
      </a>
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
      <main className="page-content" id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
