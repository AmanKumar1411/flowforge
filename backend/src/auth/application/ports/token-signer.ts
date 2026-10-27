/** Access-token claims. Role and batch are deliberately absent: they are read from the database per request. */
export interface AccessTokenClaims {
  sub: string;
  ver: number;
}

export interface SignedAccessToken {
  token: string;
  expiresInSeconds: number;
}

export abstract class TokenSigner {
  abstract sign(claims: AccessTokenClaims): Promise<SignedAccessToken>;
  /** Throws AuthDomainError("UNAUTHENTICATED") for any invalid, expired or foreign token. */
  abstract verify(token: string): Promise<AccessTokenClaims>;
}
