import { useContext } from "react";
import type { CurrentUser, UserRole } from "../types";
import { AuthContext, type AuthContextValue } from "./auth-context";

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return context;
}

const dashboards: Record<UserRole, string> = {
  STUDENT: "/student/cycles",
  FACULTY: "/faculty/cycles",
  ADMIN: "/admin",
  PENDING_STAFF: "/pending",
};

export function dashboardFor(user: CurrentUser): string {
  return dashboards[user.role];
}
