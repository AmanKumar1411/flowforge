import {
  AuthorizationRequest,
  IdentityProvider,
  PendingAuthorization,
} from "../application/ports/identity-provider";
import { ExternalIdentity } from "../domain/external-identity";

/** Where the failure line goes: Nest's Logger in production. */
export interface FailureLog {
  warn(message: string): void;
}

// Google's codes look like invalid_grant. Anything else in that field is not logged.
const GOOGLE_ERROR_CODE = /^[a-z_]{1,64}$/;

const googleCodeOf = (cause: unknown): string => {
  const code = (cause as { response?: { data?: { error?: unknown } } } | null)
    ?.response?.data?.error;
  return typeof code === "string" && GOOGLE_ERROR_CODE.test(code)
    ? code
    : "none";
};

const classOf = (value: unknown): string =>
  value instanceof Error ? value.constructor.name : typeof value;

/**
 * Decorator: adds one log line to any identity provider and changes nothing
 * else. Both failures of a Google sign-in reach the user as INVALID_ID_TOKEN,
 * so this line is where an operator learns why, for example invalid_grant
 * after a wrong client secret. It logs only the error's class and Google's
 * code: an error's message can quote a token's payload, and an authorization
 * code, a token or an email must never reach a log.
 */
export class LoggingIdentityProvider extends IdentityProvider {
  constructor(
    private readonly inner: IdentityProvider,
    private readonly log: FailureLog,
  ) {
    super();
  }

  authorizationUrl(): AuthorizationRequest {
    return this.inner.authorizationUrl();
  }

  async verifyCallback(
    code: string,
    pending: PendingAuthorization,
  ): Promise<ExternalIdentity> {
    try {
      return await this.inner.verifyCallback(code, pending);
    } catch (error) {
      const cause = (error as { cause?: unknown } | null)?.cause ?? error;
      this.log.warn(
        `Google sign-in failed: class=${classOf(cause)} google=${googleCodeOf(cause)}`,
      );
      throw error;
    }
  }
}
