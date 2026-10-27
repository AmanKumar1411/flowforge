import { useState } from "react";
import { useNavigate } from "react-router";
import { dashboardFor, useAuth } from "../auth/useAuth";

export function PendingPage() {
  const { state, reloadUser, signOut } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  if (state.status !== "signed-in") return null;
  const rejected = state.user.facultyRequestStatus === "REJECTED";

  const checkAgain = async () => {
    setChecking(true);
    const user = await reloadUser();
    setChecking(false);
    if (user && user.role !== "PENDING_STAFF") {
      navigate(dashboardFor(user), { replace: true });
    }
  };

  return (
    <main className="login-layout">
      <section className="login-intro">
        <p className="eyebrow">FlowForge / Faculty access</p>
        <h1>{rejected ? "Access not granted." : "Waiting for admin approval."}</h1>
        <p>
          {rejected
            ? "Your faculty access request was not approved. Contact the course coordinator if you think this is a mistake."
            : `Signed in as ${state.user.email}. A FlowForge admin needs to confirm that you are faculty before you can manage course cycles.`}
        </p>
      </section>
      <div className="login-card">
        <p className="card-kicker">{state.user.name}</p>
        <h2>{rejected ? "Request declined" : "Request received"}</h2>
        {!rejected && (
          <button className="primary-button" onClick={checkAgain} disabled={checking}>
            {checking ? "Checking…" : "Check again"}
          </button>
        )}
        <button
          className="text-button"
          onClick={async () => {
            await signOut();
            navigate("/login", { replace: true });
          }}
        >
          Sign out
        </button>
      </div>
    </main>
  );
}
