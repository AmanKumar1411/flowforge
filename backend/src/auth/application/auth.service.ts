import { Injectable } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { AuditService } from "../../audit/audit.service";
import {
  ONE_MINUTE_MS,
  RateLimitedError,
  RateLimiter,
} from "../../common/rate-limit";
import { TransactionRunner } from "../../common/transaction";
import { AppConfig } from "../../config/app-config";
import { UsersService } from "../../users/users.service";
import { AuthDomainError } from "../domain/auth.errors";
import { ExternalIdentity } from "../domain/external-identity";
import { Role } from "../domain/role";
import {
  FacultyDirectory,
  FacultyRequestStatus,
} from "./ports/faculty-directory";
import { DevIdentityProvider } from "./ports/dev-identity-provider";
import {
  AuthorizationRequest,
  IdentityProvider,
  PendingAuthorization,
} from "./ports/identity-provider";
import { TokenSigner } from "./ports/token-signer";
import { IssuedRefreshToken, SessionService } from "./session.service";
import { SignedIn, SignInService } from "./sign-in.service";

export interface GoogleCallback {
  code?: string;
  state?: string;
  error?: string;
}

export interface RefreshedSession {
  accessToken: string;
  expiresInSeconds: number;
  refreshToken: IssuedRefreshToken;
}

export interface CurrentUserProfile {
  id: string;
  email: string;
  name: string;
  role: Role;
  batchYear: number | null;
  avatarUrl: string | null;
  facultyRequestStatus: FacultyRequestStatus | null;
}

const sameSecret = (a: string, b: string): boolean =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

@Injectable()
export class AuthService {
  constructor(
    private readonly identityProvider: IdentityProvider,
    private readonly devIdentityProvider: DevIdentityProvider,
    private readonly signIn: SignInService,
    private readonly sessions: SessionService,
    private readonly tokenSigner: TokenSigner,
    private readonly users: UsersService,
    private readonly facultyDirectory: FacultyDirectory,
    private readonly audit: AuditService,
    private readonly transactions: TransactionRunner,
    private readonly limiter: RateLimiter,
    private readonly config: AppConfig,
  ) {}

  beginGoogleSignIn(): AuthorizationRequest {
    return this.identityProvider.authorizationUrl();
  }

  async completeGoogleSignIn(
    callback: GoogleCallback,
    pending: PendingAuthorization | null,
    userAgent: string | null,
  ): Promise<SignedIn> {
    let identity: ExternalIdentity;
    try {
      identity = await this.verifyGoogleCallback(callback, pending);
    } catch (error) {
      if (error instanceof AuthDomainError) {
        await this.signIn.recordDenial(error.code, { provider: "google" });
      }
      throw error;
    }
    // Per Google account, once Google has vouched for it; the IP limit ran before (ADR 023).
    const limit = await this.limiter.consume(
      `sign-in:${identity.sub}`,
      this.config.values.rateLimits.accountLoginPerMinute,
      ONE_MINUTE_MS,
    );
    if (!limit.allowed) {
      throw new RateLimitedError(
        "Too many sign-ins for this account; try again in a minute",
      );
    }
    return this.signIn.signIn(identity, "google", userAgent);
  }

  devSignIn(
    email: string,
    name: string,
    userAgent: string | null,
  ): Promise<SignedIn> {
    const identity = this.devIdentityProvider.identify(email, name);
    return this.signIn.signIn(identity, "dev", userAgent);
  }

  async refresh(
    presented: string | undefined,
    userAgent: string | null,
  ): Promise<RefreshedSession> {
    if (!presented) {
      throw new AuthDomainError(
        "INVALID_REFRESH_TOKEN",
        "No refresh token was sent",
      );
    }
    const session = await this.sessions.rotate(presented, userAgent);
    const signed = await this.tokenSigner.sign({
      sub: session.userId,
      ver: session.tokenVersion,
    });
    return {
      accessToken: signed.token,
      expiresInSeconds: signed.expiresInSeconds,
      refreshToken: session.refreshToken,
    };
  }

  async logout(presented: string | undefined): Promise<void> {
    if (!presented) return;
    await this.transactions.run(async (tx) => {
      const token = await this.sessions.revokeFamilyOf(presented, tx);
      if (token) {
        await this.audit.record(tx, {
          action: "LOGOUT",
          actorId: token.userId,
          entityType: "RefreshTokenFamily",
          entityId: token.familyId,
        });
      }
    });
  }

  /** Ends every session: all refresh-token families, and every access token via tokenVersion. */
  async logoutAll(userId: string): Promise<void> {
    await this.transactions.run(async (tx) => {
      await this.sessions.revokeAllForUser(userId, tx);
      await this.users.revokeAccessTokens(userId, tx);
      await this.audit.record(tx, {
        action: "LOGOUT_ALL",
        actorId: userId,
        entityType: "User",
        entityId: userId,
      });
    });
  }

  async me(userId: string): Promise<CurrentUserProfile> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new AuthDomainError("UNAUTHENTICATED", "Unknown user");
    }
    const request =
      user.role === "PENDING_STAFF"
        ? await this.facultyDirectory.findRequestForUser(user.id)
        : null;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      batchYear: user.batchYear,
      avatarUrl: user.avatarUrl,
      facultyRequestStatus: request?.status ?? null,
    };
  }

  private async verifyGoogleCallback(
    callback: GoogleCallback,
    pending: PendingAuthorization | null,
  ): Promise<ExternalIdentity> {
    if (callback.error) {
      throw new AuthDomainError(
        "SIGN_IN_CANCELLED",
        "Google sign-in was cancelled",
      );
    }
    if (
      !pending ||
      !callback.state ||
      !callback.code ||
      !sameSecret(callback.state, pending.state)
    ) {
      throw new AuthDomainError(
        "INVALID_OAUTH_STATE",
        "The sign-in response does not belong to this browser session",
      );
    }
    return this.identityProvider.verifyCallback(callback.code, pending);
  }
}
