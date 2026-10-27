import { Injectable } from "@nestjs/common";
import { CookieOptions, Request, Response } from "express";
import { API_PREFIX } from "../../common/http/api-prefix";
import { AppConfig } from "../../config/app-config";
import { PendingAuthorization } from "../application/ports/identity-provider";
import { IssuedRefreshToken } from "../application/session.service";

export const REFRESH_COOKIE = "flowforge_refresh";
const OAUTH_COOKIE = "flowforge_oauth";
const OAUTH_COOKIE_MAX_AGE_MS = 10 * 60 * 1000;

/** Cookie names, scopes and flags in one place. Values are never logged. */
@Injectable()
export class AuthCookies {
  constructor(private readonly config: AppConfig) {}

  setRefreshToken(response: Response, token: IssuedRefreshToken): void {
    response.cookie(REFRESH_COOKIE, token.value, {
      ...this.refreshOptions(),
      expires: token.expiresAt,
    });
  }

  readRefreshToken(request: Request): string | undefined {
    const value: unknown = request.cookies?.[REFRESH_COOKIE];
    return typeof value === "string" && value !== "" ? value : undefined;
  }

  clearRefreshToken(response: Response): void {
    response.clearCookie(REFRESH_COOKIE, this.refreshOptions());
  }

  setPendingAuthorization(
    response: Response,
    pending: PendingAuthorization,
  ): void {
    response.cookie(OAUTH_COOKIE, JSON.stringify(pending), {
      ...this.oauthOptions(),
      maxAge: OAUTH_COOKIE_MAX_AGE_MS,
    });
  }

  /** Returns null when the cookie is missing, expired or its signature does not verify. */
  readPendingAuthorization(request: Request): PendingAuthorization | null {
    const raw: unknown = request.signedCookies?.[OAUTH_COOKIE];
    if (typeof raw !== "string") return null;
    try {
      const value = JSON.parse(raw) as Partial<PendingAuthorization>;
      return typeof value.state === "string" &&
        typeof value.nonce === "string" &&
        typeof value.codeVerifier === "string"
        ? {
            state: value.state,
            nonce: value.nonce,
            codeVerifier: value.codeVerifier,
          }
        : null;
    } catch {
      return null;
    }
  }

  clearPendingAuthorization(response: Response): void {
    response.clearCookie(OAUTH_COOKIE, this.oauthOptions());
  }

  private refreshOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.isProduction,
      sameSite: "strict",
      path: `/${API_PREFIX}/auth`,
    };
  }

  // Lax, not Strict: the browser must send it on the top-level redirect back from Google.
  private oauthOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.isProduction,
      sameSite: "lax",
      signed: true,
      path: `/${API_PREFIX}/auth/google`,
    };
  }
}
