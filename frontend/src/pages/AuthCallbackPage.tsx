import { useEffect } from "react";
import { useNavigate } from "react-router";
import { dashboardFor, useAuth } from "../auth/useAuth";

/** Google sends the browser here with the refresh cookie set and no tokens in the URL. */
export function AuthCallbackPage() {
  const { establishSession } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    // POST /auth/refresh for the first access token, then GET /auth/me.
    void establishSession().then((user) => {
      if (!active) return;
      navigate(user ? dashboardFor(user) : "/login?error=INVALID_REFRESH_TOKEN", {
        replace: true,
      });
    });
    return () => {
      active = false;
    };
  }, [establishSession, navigate]);

  return <p className="loading page-loading">Signing you in…</p>;
}
