import {
  AuthorizationRequest,
  IdentityProvider,
  PendingAuthorization,
} from "../application/ports/identity-provider";
import { AuthDomainError } from "../domain/auth.errors";
import { ExternalIdentity } from "../domain/external-identity";
import { LoggingIdentityProvider } from "./logging-identity.provider";

const PENDING: PendingAuthorization = {
  state: "state-secret",
  nonce: "nonce-secret",
  codeVerifier: "verifier-secret",
};
const CODE = "authorization-code-secret";
const IDENTITY: ExternalIdentity = {
  sub: "google-sub",
  email: "aman.k26csai@nst.rishihood.edu.in",
  emailVerified: true,
  hostedDomain: "nst.rishihood.edu.in",
  name: "Aman",
  picture: null,
};

class GaxiosError extends Error {
  constructor(
    message: string,
    readonly response?: { data: { error: unknown } },
  ) {
    super(message);
  }
}

class StubProvider extends IdentityProvider {
  verified: { code: string; pending: PendingAuthorization } | null = null;
  authorizations = 0;

  constructor(private readonly outcome: ExternalIdentity | Error) {
    super();
  }

  authorizationUrl(): AuthorizationRequest {
    this.authorizations += 1;
    return { url: "https://accounts.example/auth", pending: PENDING };
  }

  verifyCallback(
    code: string,
    pending: PendingAuthorization,
  ): Promise<ExternalIdentity> {
    this.verified = { code, pending };
    return this.outcome instanceof Error
      ? Promise.reject(this.outcome)
      : Promise.resolve(this.outcome);
  }
}

const invalidToken = (cause?: unknown): AuthDomainError => {
  const error = new AuthDomainError("INVALID_ID_TOKEN", "Could not verify");
  if (cause !== undefined) error.cause = cause;
  return error;
};

function subject(outcome: ExternalIdentity | Error) {
  const inner = new StubProvider(outcome);
  const lines: string[] = [];
  const provider = new LoggingIdentityProvider(inner, {
    warn: (line) => lines.push(line),
  });
  return { inner, lines, provider };
}

describe("LoggingIdentityProvider", () => {
  it("delegates the authorization URL unchanged and logs nothing", () => {
    const { inner, lines, provider } = subject(IDENTITY);

    expect(provider.authorizationUrl().pending).toBe(PENDING);
    expect(inner.authorizations).toBe(1);
    expect(lines).toEqual([]);
  });

  it("passes a verified identity through unchanged and logs nothing", async () => {
    const { inner, lines, provider } = subject(IDENTITY);

    await expect(provider.verifyCallback(CODE, PENDING)).resolves.toBe(
      IDENTITY,
    );
    expect(inner.verified).toEqual({ code: CODE, pending: PENDING });
    expect(lines).toEqual([]);
  });

  it("logs the class and Google's code of a failed exchange, then rethrows the same error", async () => {
    const error = invalidToken(
      new GaxiosError("Bad Request", {
        data: { error: "invalid_grant" },
      }),
    );
    const { lines, provider } = subject(error);

    await expect(provider.verifyCallback(CODE, PENDING)).rejects.toBe(error);
    expect(lines).toEqual([
      "Google sign-in failed: class=GaxiosError google=invalid_grant",
    ]);
  });

  it("logs only the class of a failed token check, whose message can quote the token's payload", async () => {
    const error = invalidToken(
      new Error(`Wrong recipient, payload: {"email":"${IDENTITY.email}"}`),
    );
    const { lines, provider } = subject(error);

    await expect(provider.verifyCallback(CODE, PENDING)).rejects.toBe(error);
    expect(lines).toEqual(["Google sign-in failed: class=Error google=none"]);
  });

  it("logs a failure without a cause, such as a nonce that does not match", async () => {
    const { lines, provider } = subject(invalidToken());

    await expect(provider.verifyCallback(CODE, PENDING)).rejects.toThrow(
      AuthDomainError,
    );
    expect(lines).toEqual([
      "Google sign-in failed: class=AuthDomainError google=none",
    ]);
  });

  it("never logs a code, a secret, an email or an unexpected value in Google's error field", async () => {
    const error = invalidToken(
      new GaxiosError(`${CODE} ${PENDING.codeVerifier} ${IDENTITY.email}`, {
        data: { error: `token ${CODE} for ${IDENTITY.email}` },
      }),
    );
    const { lines, provider } = subject(error);

    await expect(provider.verifyCallback(CODE, PENDING)).rejects.toBe(error);
    expect(lines).toEqual([
      "Google sign-in failed: class=GaxiosError google=none",
    ]);
    const logged = lines.join("\n");
    for (const secret of [
      CODE,
      PENDING.state,
      PENDING.nonce,
      PENDING.codeVerifier,
      IDENTITY.email,
    ]) {
      expect(logged).not.toContain(secret);
    }
  });
});
