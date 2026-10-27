import type { ReactNode } from "react";
import { Navigate } from "react-router";
import type { UserRole } from "../types";
import { dashboardFor, useAuth } from "./useAuth";

/** Route guard for the UI only. The API enforces every role check on its own. */
export function RequireRole({
  roles,
  children,
}: {
  roles: UserRole[];
  children: ReactNode;
}) {
  const { state } = useAuth();
  if (state.status === "loading") {
    return <p className="loading page-loading">Checking your session…</p>;
  }
  if (state.status === "signed-out") {
    const query = state.reason ? `?error=${encodeURIComponent(state.reason)}` : "";
    return <Navigate to={`/login${query}`} replace />;
  }
  if (!roles.includes(state.user.role)) {
    return <Navigate to={dashboardFor(state.user)} replace />;
  }
  return children;
}
