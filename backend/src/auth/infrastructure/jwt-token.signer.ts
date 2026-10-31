import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createSecretKey, KeyObject } from "node:crypto";
import { AppConfig } from "../../config/app-config";
import {
  AccessTokenClaims,
  SignedAccessToken,
  TokenSigner,
} from "../application/ports/token-signer";
import { AuthDomainError } from "../domain/auth.errors";

const ALGORITHM = "HS256";

/**
 * HS256 access tokens. The key is built once: given the secret as a string,
 * jsonwebtoken first tries to parse it as a PEM public key on every verify,
 * which cost 17% of the API's CPU under load (BUG-9, H4).
 */
@Injectable()
export class JwtTokenSigner extends TokenSigner {
  private readonly key: KeyObject;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
  ) {
    super();
    this.key = createSecretKey(
      Buffer.from(config.values.jwt.accessSecret, "utf8"),
    );
  }

  async sign(claims: AccessTokenClaims): Promise<SignedAccessToken> {
    const { issuer, audience, accessTokenTtlSeconds } = this.config.values.jwt;
    const token = await this.jwt.signAsync(
      { sub: claims.sub, ver: claims.ver },
      {
        privateKey: this.key,
        algorithm: ALGORITHM,
        issuer,
        audience,
        expiresIn: accessTokenTtlSeconds,
      },
    );
    return { token, expiresInSeconds: accessTokenTtlSeconds };
  }

  async verify(token: string): Promise<AccessTokenClaims> {
    const { issuer, audience } = this.config.values.jwt;
    let payload: Record<string, unknown>;
    try {
      // Pinning the algorithm rejects "none" and asymmetric-key confusion tokens.
      payload = await this.jwt.verifyAsync(token, {
        // Typed as string | Buffer, but handed to jsonwebtoken, which takes a KeyObject.
        publicKey: this.key as unknown as Buffer,
        algorithms: [ALGORITHM],
        issuer,
        audience,
      });
    } catch {
      throw this.unauthenticated();
    }
    if (typeof payload.sub !== "string" || !Number.isInteger(payload.ver)) {
      throw this.unauthenticated();
    }
    return { sub: payload.sub, ver: payload.ver as number };
  }

  private unauthenticated(): AuthDomainError {
    return new AuthDomainError(
      "UNAUTHENTICATED",
      "Access token is missing, invalid or expired",
    );
  }
}
