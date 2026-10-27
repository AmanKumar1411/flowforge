import { OAuth2Client } from "google-auth-library";

export interface GoogleIdTokenClaims {
  sub: string;
  email?: string;
  email_verified?: boolean;
  hd?: string;
  name?: string;
  picture?: string;
  nonce?: string;
}

/** The two network calls Google Sign-In needs, so the provider logic can be tested without Google. */
export abstract class GoogleOAuthClient {
  abstract exchangeCode(code: string, codeVerifier: string): Promise<string>;
  /** Verifies signature, issuer, audience and expiry. Throws on any failure. */
  abstract verifyIdToken(idToken: string): Promise<GoogleIdTokenClaims>;
}

export class GoogleAuthLibraryClient extends GoogleOAuthClient {
  constructor(
    private readonly client: OAuth2Client,
    private readonly audience: string,
  ) {
    super();
  }

  async exchangeCode(code: string, codeVerifier: string): Promise<string> {
    const { tokens } = await this.client.getToken({ code, codeVerifier });
    if (!tokens.id_token) {
      throw new Error("Google did not return an ID token");
    }
    return tokens.id_token;
  }

  async verifyIdToken(idToken: string): Promise<GoogleIdTokenClaims> {
    const ticket = await this.client.verifyIdToken({
      idToken,
      audience: this.audience,
    });
    const payload = ticket.getPayload();
    if (!payload) {
      throw new Error("Google ID token has no payload");
    }
    return payload;
  }
}
