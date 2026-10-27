import { apiBaseUrl } from "../config";
import type { CurrentUser } from "../types";
import { apiRequest, clearAccessToken } from "./client";

/** A full-page navigation: the API sets a state cookie and redirects to Google. */
export const googleSignInUrl = `${apiBaseUrl}/auth/google`;

export function fetchCurrentUser() {
  return apiRequest<CurrentUser>("/auth/me");
}

export function devLogin(email: string, name: string) {
  return apiRequest<void>("/auth/dev-login", {
    method: "POST",
    body: JSON.stringify({ email, name }),
  });
}

export async function logout() {
  try {
    await apiRequest<void>("/auth/logout", { method: "POST" });
  } finally {
    clearAccessToken();
  }
}

export async function logoutEverywhere() {
  try {
    await apiRequest<void>("/auth/logout-all", { method: "POST" });
  } finally {
    clearAccessToken();
  }
}
