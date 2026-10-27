import { Injectable } from "@nestjs/common";
import { UsersService } from "../../../users/users.service";
import { AuthenticatedUser } from "../../application/authenticated-user";
import { TokenSigner } from "../../application/ports/token-signer";
import { AuthDomainError } from "../../domain/auth.errors";

/**
 * Verifies the bearer JWT, then reads the user by primary key on every
 * request. Role and batch come from that read, so a role change, a
 * deactivation or a tokenVersion bump takes effect on the very next request.
 */
@Injectable()
export class AccessTokenStrategy {
  constructor(
    private readonly tokenSigner: TokenSigner,
    private readonly users: UsersService,
  ) {}

  async authenticate(
    authorization: string | undefined,
  ): Promise<AuthenticatedUser> {
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length).trim()
      : "";
    if (!token) {
      throw new AuthDomainError(
        "UNAUTHENTICATED",
        "Missing bearer access token",
      );
    }
    const claims = await this.tokenSigner.verify(token);
    const state = await this.users.findAccessState(claims.sub);
    if (!state) {
      throw new AuthDomainError("UNAUTHENTICATED", "Unknown user");
    }
    if (state.status === "DEACTIVATED") {
      throw new AuthDomainError(
        "ACCOUNT_DEACTIVATED",
        "This account is deactivated",
      );
    }
    if (state.tokenVersion !== claims.ver) {
      throw new AuthDomainError(
        "TOKEN_REVOKED",
        "This access token was revoked; refresh to continue",
      );
    }
    return { id: state.id, role: state.role, batchYear: state.batchYear };
  }
}
