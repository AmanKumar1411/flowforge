/** A person as an identity provider vouches for them, after the provider's own token checks. */
export interface ExternalIdentity {
  /** Stable provider account id. Users are identified by this, never by email. */
  sub: string;
  email: string;
  emailVerified: boolean;
  hostedDomain: string | null;
  name: string;
  picture: string | null;
}
