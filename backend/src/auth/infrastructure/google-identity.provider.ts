import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { AppConfig } from "../../config/app-config";
import {
  AuthorizationRequest,
  IdentityProvider,
  PendingAuthorization,
} from "../application/ports/identity-provider";
import { AuthDomainError } from "../domain/auth.errors";
import { ExternalIdentity } from "../domain/external-identity";
import { GoogleIdTokenClaims, GoogleOAuthClient } from "./google-oauth.client";

const AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";

const randomToken = (): string => randomBytes(32).toString("base64url");

/** Server-side authorization code flow with PKCE, state and nonce. */
@Injectable()
export class GoogleIdentityProvider extends IdentityProvider {
  constructor(
    private readonly google: GoogleOAuthClient,
    private readonly config: AppConfig,
  ) {
    super();
  }

  authorizationUrl(): AuthorizationRequest {
    const pending: PendingAuthorization = {
      state: randomToken(),
      nonce: randomToken(),
      codeVerifier: randomToken(),
    };
    const { clientId, redirectUri } = this.config.values.google;
    const url = new URL(AUTHORIZATION_ENDPOINT);
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state: pending.state,
      nonce: pending.nonce,
      code_challenge: createHash("sha256")
        .update(pending.codeVerifier)
        .digest("base64url"),
      code_challenge_method: "S256",
      // Only a hint for Google's account chooser; the callback enforces the domain.
      hd: this.config.values.allowedHostedDomain,
      prompt: "select_account",
    }).toString();
    return { url: url.toString(), pending };
  }

  async verifyCallback(
    code: string,
    pending: PendingAuthorization,
  ): Promise<ExternalIdentity> {
    let claims: GoogleIdTokenClaims;
    try {
      const idToken = await this.google.exchangeCode(
        code,
        pending.codeVerifier,
      );
      claims = await this.google.verifyIdToken(idToken);
    } catch {
      throw this.invalid("Google ID token could not be verified");
    }
    if (claims.nonce !== pending.nonce) {
      throw this.invalid("Google ID token nonce does not match this login");
    }
    if (!claims.sub || !claims.email) {
      throw this.invalid("Google ID token has no subject or email");
    }
    return {
      sub: claims.sub,
      email: claims.email,
      emailVerified: claims.email_verified === true,
      hostedDomain: claims.hd ?? null,
      name: claims.name ?? claims.email,
      picture: claims.picture ?? null,
    };
  }

  private invalid(message: string): AuthDomainError {
    return new AuthDomainError("INVALID_ID_TOKEN", message);
  }
}
