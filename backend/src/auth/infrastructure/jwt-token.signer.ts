import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AppConfig } from "../../config/app-config";
import {
  AccessTokenClaims,
  SignedAccessToken,
  TokenSigner,
} from "../application/ports/token-signer";
import { AuthDomainError } from "../domain/auth.errors";

const ALGORITHM = "HS256";

@Injectable()
export class JwtTokenSigner extends TokenSigner {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
  ) {
    super();
  }

  async sign(claims: AccessTokenClaims): Promise<SignedAccessToken> {
    const { accessSecret, issuer, audience, accessTokenTtlSeconds } =
      this.config.values.jwt;
    const token = await this.jwt.signAsync(
      { sub: claims.sub, ver: claims.ver },
      {
        secret: accessSecret,
        algorithm: ALGORITHM,
        issuer,
        audience,
        expiresIn: accessTokenTtlSeconds,
      },
    );
    return { token, expiresInSeconds: accessTokenTtlSeconds };
  }

  async verify(token: string): Promise<AccessTokenClaims> {
    const { accessSecret, issuer, audience } = this.config.values.jwt;
    let payload: Record<string, unknown>;
    try {
      // Pinning the algorithm rejects "none" and asymmetric-key confusion tokens.
      payload = await this.jwt.verifyAsync(token, {
        secret: accessSecret,
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
