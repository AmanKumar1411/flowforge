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

/**
 * A refresh either gives a token, or answers that the session is over
 * (`transient: false`, e.g. 401), or could not get an answer: the API or its
 * database is down, or the session is rate limited (`transient: true`).
 */
type RefreshResult = { accessToken: string } | { errorCode: string; transient: boolean };

// The access token lives in memory only: never localStorage, so a script injected into the page cannot read it later.
let accessToken: string | null = null;
let refreshInFlight: Promise<RefreshResult> | null = null;
let onSessionEnded: (code: string) => void = () => undefined;
let onReachability: (reachable: boolean) => void = () => undefined;

export function setSessionEndedHandler(handler: (code: string) => void) {
  onSessionEnded = handler;
}

/** Told `false` while FlowForge can't be reached (the app shows a banner), and `true` once it answers again. */
export function setReachabilityHandler(handler: (reachable: boolean) => void) {
  onReachability = handler;
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
    // Only an answer about the session ends it; the API, its database or a limit failing does not (H6).
    if (response.status >= 500 || response.status === 429) {
      return { errorCode: body.code ?? "SERVICE_UNAVAILABLE", transient: true };
    }
    accessToken = null;
    return { errorCode: body.code ?? "INVALID_REFRESH_TOKEN", transient: false };
  } catch {
    return { errorCode: "NETWORK_ERROR", transient: true };
  }
}

/** Waits between tries while FlowForge can't be reached: 1, 2, 4, 8, then every 15 seconds. */
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000];
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs `work` until it gets an answer: a network error, a 5xx or a 429 is tried again with backoff. */
export async function retryWhileUnreachable<T>(work: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const result = await work();
      if (attempt > 0) onReachability(true);
      return result;
    } catch (error) {
      const transient = !(error instanceof ApiError) || (error.status ?? 0) >= 500 || error.status === 429;
      if (!transient) {
        if (attempt > 0) onReachability(true);
        throw error;
      }
      onReachability(false);
      await wait(RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]);
    }
  }
}

/** Refreshes until the API answers: only an answer (a token, or the session is over) ends the wait. */
export function refreshUntilAnswered(): Promise<RefreshResult> {
  return retryWhileUnreachable(async () => {
    const result = await refreshAccessToken();
    if ("errorCode" in result && result.transient) {
      throw new ApiError("FlowForge can't be reached", result.errorCode, 503);
    }
    return result;
  });
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
    const refreshed = await refreshUntilAnswered();
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
