import { apiBaseUrl } from "../config";

export class ApiError extends Error {
  readonly code?: string;
  readonly status?: number;
  /** Several problems reported at once (a blocked publish). */
  readonly details: { code: string; message: string }[];

  constructor(
    message: string,
    code?: string,
    status?: number,
    details: { code: string; message: string }[] = [],
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type RefreshResult = { accessToken: string } | { errorCode: string };

// The access token lives in memory only: never localStorage, so a script injected into the page cannot read it later.
let accessToken: string | null = null;
let refreshInFlight: Promise<RefreshResult> | null = null;
let onSessionEnded: (code: string) => void = () => undefined;

export function setSessionEndedHandler(handler: (code: string) => void) {
  onSessionEnded = handler;
}

export function clearAccessToken() {
  accessToken = null;
}

/**
 * Single-flight: every caller that needs a new token while one refresh is
 * running shares it. Two refreshes with the same cookie would look like a
 * stolen token to the API and end the session. The Web Locks API extends the
 * same guarantee across browser tabs, which share the cookie.
 */
export function refreshAccessToken(): Promise<RefreshResult> {
  refreshInFlight ??= withCrossTabLock(postRefresh).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

function withCrossTabLock<T>(work: () => Promise<T>): Promise<T> {
  return navigator.locks
    ? navigator.locks.request("flowforge-refresh", work)
    : work();
}

async function postRefresh(): Promise<RefreshResult> {
  try {
    const response = await fetch(`${apiBaseUrl}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    const body = (await response.json().catch(() => ({}))) as {
      accessToken?: string;
      code?: string;
    };
    if (response.ok && body.accessToken) {
      accessToken = body.accessToken;
      return { accessToken: body.accessToken };
    }
    accessToken = null;
    return { errorCode: body.code ?? "INVALID_REFRESH_TOKEN" };
  } catch {
    return { errorCode: "NETWORK_ERROR" };
  }
}

// Cookie-authenticated routes: a 401 from them is an answer, not an expired access token.
const NO_RETRY_PATHS = ["/auth/refresh", "/auth/dev-login", "/auth/logout"];

/** Sends a request with the access token. On a 401 it refreshes once and retries once. */
export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response = await send(path, options);
  if (response.status === 401 && !NO_RETRY_PATHS.includes(path)) {
    const error = await toApiError(response);
    // A refresh cannot fix a deactivated account; end the session with the real reason.
    if (error.code === "ACCOUNT_DEACTIVATED") {
      clearAccessToken();
      onSessionEnded(error.code);
      throw error;
    }
    const refreshed = await refreshAccessToken();
    if ("errorCode" in refreshed) {
      onSessionEnded(refreshed.errorCode);
      throw error;
    }
    response = await send(path, options);
  }
  if (!response.ok) {
    throw await toApiError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

function send(path: string, options: RequestInit): Promise<Response> {
  return fetch(`${apiBaseUrl}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  });
}

async function toApiError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => ({}))) as {
    message?: string;
    code?: string;
    details?: { code: string; message: string }[];
  };
  return new ApiError(
    body.message || "The request could not be completed.",
    body.code,
    response.status,
    Array.isArray(body.details) ? body.details : [],
  );
}
