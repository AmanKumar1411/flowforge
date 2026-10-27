const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

export const apiBaseUrl = configuredApiBaseUrl || "http://localhost:3000/api";

/** Shows the dev login form. The API decides whether dev login actually works. */
export const devLoginEnabled = import.meta.env.VITE_DEV_LOGIN === "true";
