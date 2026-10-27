import {
  GoogleIdTokenClaims,
  GoogleOAuthClient,
} from "../../src/auth/infrastructure/google-oauth.client";

/**
 * Google's network side, scripted per authorization code. Everything above
 * it (state, PKCE, nonce, hosted domain, email_verified, role resolution,
 * audit) is the real application code.
 */
export class FakeGoogle extends GoogleOAuthClient {
  private readonly scripts = new Map<string, GoogleIdTokenClaims | Error>();
  readonly exchanges: { code: string; codeVerifier: string }[] = [];

  /** The callback with this code will see these claims, or fail verification with this error. */
  script(code: string, outcome: GoogleIdTokenClaims | Error): void {
    this.scripts.set(code, outcome);
  }

  async exchangeCode(code: string, codeVerifier: string): Promise<string> {
    this.exchanges.push({ code, codeVerifier });
    if (!this.scripts.has(code)) {
      throw new Error("invalid_grant");
    }
    return code;
  }

  async verifyIdToken(idToken: string): Promise<GoogleIdTokenClaims> {
    const outcome = this.scripts.get(idToken);
    if (!outcome) throw new Error("Unknown ID token");
    if (outcome instanceof Error) throw outcome;
    return outcome;
  }
}
