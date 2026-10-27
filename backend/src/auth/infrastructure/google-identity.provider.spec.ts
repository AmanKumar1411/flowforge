import { createHash } from "node:crypto";
import { createTestAppConfig } from "../../config/testing/test-environment";
import { PendingAuthorization } from "../application/ports/identity-provider";
import { GoogleIdentityProvider } from "./google-identity.provider";
import { GoogleIdTokenClaims, GoogleOAuthClient } from "./google-oauth.client";

jest.mock("@nestjs/common", () => ({
  Injectable: () => (target: unknown) => target,
}));

class FakeGoogle extends GoogleOAuthClient {
  claims: GoogleIdTokenClaims = {
    sub: "google-sub-1",
    email: "prakriti.p@nst.rishihood.edu.in",
    email_verified: true,
    hd: "nst.rishihood.edu.in",
    name: "Prakriti P",
    picture: "https://example.com/p.png",
    nonce: "nonce-1",
  };
  exchangedWith: string[] = [];
  verifyError: Error | null = null;

  async exchangeCode(code: string, codeVerifier: string): Promise<string> {
    this.exchangedWith = [code, codeVerifier];
    return "id-token";
  }

  async verifyIdToken(): Promise<GoogleIdTokenClaims> {
    if (this.verifyError) throw this.verifyError;
    return this.claims;
  }
}

const pending: PendingAuthorization = {
  state: "state-1",
  nonce: "nonce-1",
  codeVerifier: "verifier-1",
};

describe("GoogleIdentityProvider", () => {
  let google: FakeGoogle;
  let provider: GoogleIdentityProvider;

  beforeEach(() => {
    google = new FakeGoogle();
    provider = new GoogleIdentityProvider(google, createTestAppConfig());
  });

  it("builds a PKCE authorization URL with state, nonce and the hosted-domain hint", () => {
    const { url, pending: generated } = provider.authorizationUrl();
    const params = new URL(url).searchParams;

    expect(
      url.startsWith("https://accounts.google.com/o/oauth2/v2/auth?"),
    ).toBe(true);
    expect(params.get("scope")).toBe("openid email profile");
    expect(params.get("hd")).toBe("nst.rishihood.edu.in");
    expect(params.get("state")).toBe(generated.state);
    expect(params.get("nonce")).toBe(generated.nonce);
    expect(params.get("code_challenge_method")).toBe("S256");
    expect(params.get("code_challenge")).toBe(
      createHash("sha256").update(generated.codeVerifier).digest("base64url"),
    );
    expect(params.get("redirect_uri")).toBe(
      "http://localhost:3000/api/auth/google/callback",
    );
    expect(params.has("code_verifier")).toBe(false);
  });

  it("generates fresh secrets for every login", () => {
    const a = provider.authorizationUrl().pending;
    const b = provider.authorizationUrl().pending;
    expect(a.state).not.toBe(b.state);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
  });

  it("exchanges the code with the PKCE verifier and maps the claims", async () => {
    await expect(provider.verifyCallback("code-1", pending)).resolves.toEqual({
      sub: "google-sub-1",
      email: "prakriti.p@nst.rishihood.edu.in",
      emailVerified: true,
      hostedDomain: "nst.rishihood.edu.in",
      name: "Prakriti P",
      picture: "https://example.com/p.png",
    });
    expect(google.exchangedWith).toEqual(["code-1", "verifier-1"]);
  });

  it("reports an unverified email and a missing hosted domain as facts, not errors", async () => {
    google.claims = { ...google.claims, email_verified: false, hd: undefined };

    await expect(
      provider.verifyCallback("code-1", pending),
    ).resolves.toMatchObject({ emailVerified: false, hostedDomain: null });
  });

  it("rejects a token whose nonce belongs to another login", async () => {
    google.claims = { ...google.claims, nonce: "nonce-of-someone-else" };

    await expect(
      provider.verifyCallback("code-1", pending),
    ).rejects.toMatchObject({ code: "INVALID_ID_TOKEN" });
  });

  it("turns any library failure (signature, audience, expiry) into INVALID_ID_TOKEN", async () => {
    google.verifyError = new Error(
      "Wrong recipient, payload audience != requiredAudience",
    );

    await expect(
      provider.verifyCallback("code-1", pending),
    ).rejects.toMatchObject({ code: "INVALID_ID_TOKEN" });
  });

  it("rejects a token without an email", async () => {
    google.claims = { ...google.claims, email: undefined };

    await expect(
      provider.verifyCallback("code-1", pending),
    ).rejects.toMatchObject({ code: "INVALID_ID_TOKEN" });
  });
});
