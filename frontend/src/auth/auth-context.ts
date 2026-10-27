import { createContext } from "react";
import type { CurrentUser } from "../types";

export type AuthState =
  | { status: "loading" }
  | { status: "signed-out"; reason?: string }
  | { status: "signed-in"; user: CurrentUser };

export interface AuthContextValue {
  state: AuthState;
  /** Refresh once (shared by every caller) and load /auth/me. */
  establishSession: () => Promise<CurrentUser | null>;
  /** Reload /auth/me, e.g. to see whether a pending request was approved. */
  reloadUser: () => Promise<CurrentUser | null>;
  signOut: () => Promise<void>;
  signOutEverywhere: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
