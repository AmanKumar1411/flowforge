import { ExternalIdentity } from "../../domain/external-identity";

/** Per-login secrets kept in a short-lived signed cookie between redirect and callback. */
export interface PendingAuthorization {
  state: string;
  nonce: string;
  codeVerifier: string;
}

export interface AuthorizationRequest {
  url: string;
  pending: PendingAuthorization;
}

export abstract class IdentityProvider {
  abstract authorizationUrl(): AuthorizationRequest;
  /**
   * Exchanges the authorization code and verifies the ID token, including its nonce.
   * Throws AuthDomainError("INVALID_ID_TOKEN") when anything does not check out.
   */
  abstract verifyCallback(
    code: string,
    pending: PendingAuthorization,
  ): Promise<ExternalIdentity>;
}
