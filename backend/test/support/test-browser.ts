import { FRONTEND_ORIGIN } from "./constants";

export interface HttpResult<T = Record<string, unknown>> {
  status: number;
  body: T;
  location: string | null;
}

interface RequestOptions {
  body?: unknown;
  /** Defaults to the browser's current access token. Pass null to send none. */
  token?: string | null;
  /** Defaults to the FlowForge frontend origin. Pass null to send none. */
  origin?: string | null;
  cookie?: string;
}

interface StoredCookie {
  value: string;
  path: string;
}

/**
 * A minimal browser: keeps cookies (respecting Path), never follows
 * redirects, and holds the access token in memory like the real frontend.
 */
export class TestBrowser {
  private readonly cookies = new Map<string, StoredCookie>();
  accessToken: string | null = null;

  constructor(private readonly apiUrl: string) {}

  cookie(name: string): string | undefined {
    return this.cookies.get(name)?.value;
  }

  get<T = Record<string, unknown>>(path: string, options?: RequestOptions) {
    return this.request<T>("GET", path, options);
  }

  post<T = Record<string, unknown>>(path: string, options?: RequestOptions) {
    return this.request<T>("POST", path, options);
  }

  patch<T = Record<string, unknown>>(path: string, options?: RequestOptions) {
    return this.request<T>("PATCH", path, options);
  }

  delete<T = Record<string, unknown>>(path: string, options?: RequestOptions) {
    return this.request<T>("DELETE", path, options);
  }

  async devLogin(email: string, name = "Test User"): Promise<HttpResult> {
    return this.post("/auth/dev-login", { body: { email, name }, token: null });
  }

  async refresh(): Promise<HttpResult> {
    const result = await this.post("/auth/refresh", { token: null });
    if (result.status === 200) {
      this.accessToken = String(result.body.accessToken);
    }
    return result;
  }

  /** Dev login plus the first refresh, the same as the frontend's /auth/callback page. */
  async signIn(email: string, name?: string): Promise<this> {
    const login = await this.devLogin(email, name);
    if (login.status !== 204) {
      throw new Error(
        `dev login failed: ${login.status} ${JSON.stringify(login.body)}`,
      );
    }
    const refreshed = await this.refresh();
    if (refreshed.status !== 200) {
      throw new Error(`refresh failed: ${refreshed.status}`);
    }
    return this;
  }

  async request<T = Record<string, unknown>>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<HttpResult<T>> {
    const url = new URL(`${this.apiUrl}${path}`);
    const headers: Record<string, string> = {};
    const origin =
      options.origin === undefined ? FRONTEND_ORIGIN : options.origin;
    if (origin) headers.Origin = origin;
    const token =
      options.token === undefined ? this.accessToken : options.token;
    if (token) headers.Authorization = `Bearer ${token}`;
    const cookieHeader = options.cookie ?? this.cookieHeaderFor(url.pathname);
    if (cookieHeader) headers.Cookie = cookieHeader;
    if (options.body !== undefined)
      headers["Content-Type"] = "application/json";

    const response = await fetch(url, {
      method,
      headers,
      redirect: "manual",
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    this.storeCookies(response.headers.getSetCookie());
    const text = await response.text();
    const isJson = response.headers
      .get("content-type")
      ?.includes("application/json");
    return {
      status: response.status,
      body: (isJson && text ? JSON.parse(text) : {}) as T,
      location: response.headers.get("location"),
    };
  }

  private cookieHeaderFor(pathname: string): string {
    return [...this.cookies.entries()]
      .filter(([, cookie]) => pathname.startsWith(cookie.path))
      .map(([name, cookie]) => `${name}=${cookie.value}`)
      .join("; ");
  }

  private storeCookies(setCookies: string[]): void {
    for (const header of setCookies) {
      const [pair, ...attributes] = header
        .split(";")
        .map((part) => part.trim());
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      const path =
        attributes
          .find((attribute) => attribute.toLowerCase().startsWith("path="))
          ?.slice(5) ?? "/";
      const expires = attributes.find((attribute) =>
        attribute.toLowerCase().startsWith("expires="),
      );
      const expired = expires && new Date(expires.slice(8)) <= new Date();
      if (!value || expired) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, { value, path });
      }
    }
  }
}
