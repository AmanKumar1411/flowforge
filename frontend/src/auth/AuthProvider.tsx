import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fetchCurrentUser, logout, logoutEverywhere } from "../api/auth";
import { refreshAccessToken, setSessionEndedHandler } from "../api/client";
import type { CurrentUser } from "../types";
import { AuthContext, type AuthState } from "./auth-context";

// Worth telling the user about; a first visit without a cookie is not.
const SESSION_END_REASONS = new Set([
  "TOKEN_REVOKED",
  "REFRESH_TOKEN_REUSED",
  "ACCOUNT_DEACTIVATED",
]);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const sessionRequest = useRef<Promise<CurrentUser | null> | null>(null);

  useEffect(() => {
    setSessionEndedHandler((reason) => setState({ status: "signed-out", reason }));
  }, []);

  const reloadUser = useCallback(async () => {
    try {
      const user = await fetchCurrentUser();
      setState({ status: "signed-in", user });
      return user;
    } catch {
      setState((current) =>
        current.status === "signed-out" ? current : { status: "signed-out" },
      );
      return null;
    }
  }, []);

  // React StrictMode runs effects twice; sharing one promise keeps it to one refresh.
  const establishSession = useCallback(() => {
    sessionRequest.current ??= refreshAccessToken()
      .then((result) => {
        if ("errorCode" in result) {
          setState({
            status: "signed-out",
            reason: SESSION_END_REASONS.has(result.errorCode)
              ? result.errorCode
              : undefined,
          });
          return null;
        }
        return reloadUser();
      })
      .finally(() => {
        sessionRequest.current = null;
      });
    return sessionRequest.current;
  }, [reloadUser]);

  useEffect(() => {
    void establishSession();
  }, [establishSession]);

  const signOut = useCallback(async () => {
    await logout().catch(() => undefined);
    setState({ status: "signed-out" });
  }, []);

  const signOutEverywhere = useCallback(async () => {
    await logoutEverywhere().catch(() => undefined);
    setState({ status: "signed-out" });
  }, []);

  const value = useMemo(
    () => ({ state, establishSession, reloadUser, signOut, signOutEverywhere }),
    [state, establishSession, reloadUser, signOut, signOutEverywhere],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
