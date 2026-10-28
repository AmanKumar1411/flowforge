import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { Clock } from "../../common/clock";
import { Transaction, TransactionRunner } from "../../common/transaction";
import { AppConfig } from "../../config/app-config";
import { User } from "../../users/domain/user";
import { UsersService } from "../../users/users.service";
import { AuthDomainError, AuthErrorCode } from "../domain/auth.errors";
import { BatchYearPolicy } from "../domain/batch-year.policy";
import { ExternalIdentity } from "../domain/external-identity";
import { Role } from "../domain/role";
import { RoleResolver } from "../domain/role-resolver";
import {
  normalizeEmail,
  UniversityIdentity,
  UniversityIdentityParser,
} from "../domain/university-identity-parser";
import { FacultyDirectory } from "./ports/faculty-directory";
import { IssuedRefreshToken, SessionService } from "./session.service";

export type SignInProvider = "google" | "dev";

export interface SignedIn {
  userId: string;
  role: Role;
  refreshToken: IssuedRefreshToken;
}

type SignInOutcome =
  | { kind: "SIGNED_IN"; signedIn: SignedIn }
  | { kind: "DENIED"; error: AuthDomainError };

interface DenialContext {
  provider: SignInProvider;
  email?: string;
  userId?: string;
}

/**
 * Turns a verified external identity into a FlowForge session in one
 * transaction: find the user by provider sub (or claim the pre-registered
 * account with this email), resolve the role, create or update the user,
 * record a pending faculty request, start a refresh-token family and write
 * the audit trail. Denials are audited too.
 */
@Injectable()
export class SignInService {
  constructor(
    private readonly identityParser: UniversityIdentityParser,
    private readonly roleResolver: RoleResolver,
    private readonly batchYearPolicy: BatchYearPolicy,
    private readonly facultyDirectory: FacultyDirectory,
    private readonly users: UsersService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly transactions: TransactionRunner,
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {}

  async signIn(
    identity: ExternalIdentity,
    provider: SignInProvider,
    userAgent: string | null,
  ): Promise<SignedIn> {
    // Denials are returned, not thrown, so their audit row commits.
    const outcome = await this.transactions.run((tx) =>
      this.trySignIn(identity, provider, userAgent, tx),
    );
    if (outcome.kind === "DENIED") {
      throw outcome.error;
    }
    return outcome.signedIn;
  }

  /** Audits a login that failed before any identity was established (bad state, bad token). */
  async recordDenial(
    code: AuthErrorCode,
    context: DenialContext,
  ): Promise<void> {
    await this.transactions.run((tx) => this.auditDenial(code, context, tx));
  }

  private async trySignIn(
    identity: ExternalIdentity,
    provider: SignInProvider,
    userAgent: string | null,
    tx: Transaction,
  ): Promise<SignInOutcome> {
    const email = normalizeEmail(identity.email);
    const context: DenialContext = { provider, email };

    if (!identity.emailVerified) {
      return this.deny("EMAIL_NOT_VERIFIED", context, tx);
    }
    if (identity.hostedDomain !== this.config.values.allowedHostedDomain) {
      return this.deny("WRONG_HOSTED_DOMAIN", context, tx);
    }

    const university = this.identityParser.parse(email);
    const known = await this.users.findByGoogleSub(identity.sub, tx);
    // ADR 012: an account pre-registered by a faculty import has no sub yet; its email's first sign-in claims it.
    const preRegistered = known
      ? null
      : await this.findPreRegistered(email, tx);
    const existing = known ?? preRegistered;
    const resolution = this.roleResolver.resolve({
      identity: university,
      existingUser: existing,
      isBootstrapAdmin: this.config.values.adminBootstrapEmails.has(email),
      isApprovedFaculty:
        university.kind === "STAFF" &&
        (await this.facultyDirectory.isApproved(email, tx)),
    });
    if (resolution.outcome === "DENIED") {
      return this.deny(
        resolution.code,
        { ...context, userId: existing?.id },
        tx,
      );
    }

    const subject = preRegistered
      ? await this.claim(preRegistered, identity, provider, tx)
      : existing;
    if (subject instanceof AuthDomainError) {
      return this.deny(subject.code, { ...context, userId: existing?.id }, tx);
    }
    const result = subject
      ? await this.updateUser(subject, identity, resolution.role, tx)
      : await this.createUser(identity, university, resolution.role, tx);
    if (result instanceof AuthDomainError) {
      return this.deny(result.code, { ...context, userId: existing?.id }, tx);
    }
    const user = result;

    if (
      user.role === "PENDING_STAFF" &&
      (await this.facultyDirectory.createRequestIfAbsent(user.id, email, tx))
    ) {
      await this.audit.record(tx, {
        action: "FACULTY_REQUEST_CREATED",
        actorId: user.id,
        entityType: "User",
        entityId: user.id,
        metadata: { email },
      });
    }

    const refreshToken = await this.sessions.startFamily(
      user.id,
      userAgent,
      tx,
    );
    await this.audit.record(tx, {
      action: "LOGIN_SUCCEEDED",
      actorId: user.id,
      entityType: "User",
      entityId: user.id,
      metadata: { provider, role: user.role },
    });
    return {
      kind: "SIGNED_IN",
      signedIn: { userId: user.id, role: user.role, refreshToken },
    };
  }

  private async findPreRegistered(
    email: string,
    tx: Transaction,
  ): Promise<User | null> {
    const user = await this.users.findByEmail(email, tx);
    return user?.googleSub === null ? user : null;
  }

  /** A double sign-in may race for the claim; the loser finds the account under its own sub. */
  private async claim(
    preRegistered: User,
    identity: ExternalIdentity,
    provider: SignInProvider,
    tx: Transaction,
  ): Promise<User | AuthDomainError> {
    const claimed = await this.users.claim(preRegistered.id, identity.sub, tx);
    if (!claimed) {
      const mine = await this.users.findByGoogleSub(identity.sub, tx);
      return mine ?? this.identityConflict();
    }
    await this.audit.record(tx, {
      action: "USER_CLAIMED",
      actorId: claimed.id,
      entityType: "User",
      entityId: claimed.id,
      metadata: { provider },
    });
    return claimed;
  }

  private async createUser(
    identity: ExternalIdentity,
    university: UniversityIdentity,
    role: Role,
    tx: Transaction,
  ): Promise<User | AuthDomainError> {
    if (await this.users.findByEmail(university.email, tx)) {
      return this.identityConflict();
    }
    let batchYear: number | null = null;
    if (university.kind === "STUDENT") {
      try {
        this.batchYearPolicy.assertValid(university.batchYear);
      } catch (error) {
        if (error instanceof AuthDomainError) return error;
        throw error;
      }
      // Set once, from the email. Later logins never overwrite an admin's correction.
      batchYear = university.batchYear;
    }

    const user = await this.users.register(
      {
        googleSub: identity.sub,
        email: university.email,
        name: identity.name,
        avatarUrl: identity.picture,
        role,
        batchYear,
        lastLoginAt: this.clock.now(),
      },
      tx,
    );
    await this.audit.record(tx, {
      action: "USER_CREATED",
      actorId: user.id,
      entityType: "User",
      entityId: user.id,
      metadata: { email: user.email, batchYear },
    });
    await this.audit.record(tx, {
      action: "ROLE_ASSIGNED",
      actorId: user.id,
      entityType: "User",
      entityId: user.id,
      metadata: { from: null, to: role, reason: "FIRST_LOGIN" },
    });
    return user;
  }

  private async updateUser(
    existing: User,
    identity: ExternalIdentity,
    role: Role,
    tx: Transaction,
  ): Promise<User | AuthDomainError> {
    const email = normalizeEmail(identity.email);
    if (email !== existing.email && (await this.users.findByEmail(email, tx))) {
      return this.identityConflict();
    }
    let user = await this.users.recordLogin(
      existing.id,
      {
        email,
        name: identity.name,
        avatarUrl: identity.picture,
        lastLoginAt: this.clock.now(),
      },
      tx,
    );
    if (user.role !== role) {
      user = await this.users.changeRole(user.id, role, tx);
      await this.audit.record(tx, {
        action: "ROLE_ASSIGNED",
        actorId: user.id,
        entityType: "User",
        entityId: user.id,
        metadata: { from: existing.role, to: role, reason: "LOGIN" },
      });
    }
    return user;
  }

  private identityConflict(): AuthDomainError {
    return new AuthDomainError(
      "IDENTITY_CONFLICT",
      "This email already belongs to a different account; contact the coordinator",
    );
  }

  private async deny(
    code: AuthErrorCode,
    context: DenialContext,
    tx: Transaction,
  ): Promise<SignInOutcome> {
    await this.auditDenial(code, context, tx);
    return {
      kind: "DENIED",
      error: new AuthDomainError(
        code,
        denialMessages[code] ?? "Sign-in denied",
      ),
    };
  }

  private auditDenial(
    code: AuthErrorCode,
    context: DenialContext,
    tx: Transaction,
  ): Promise<void> {
    return this.audit.record(tx, {
      action: "LOGIN_DENIED",
      actorId: context.userId ?? null,
      entityType: "LoginAttempt",
      entityId: context.email ?? "unknown",
      metadata: { reason: code, provider: context.provider },
    });
  }
}

const denialMessages: Partial<Record<AuthErrorCode, string>> = {
  EMAIL_NOT_VERIFIED: "Your Google account email is not verified",
  WRONG_HOSTED_DOMAIN: "Sign in with your university Google account",
  EMAIL_NOT_ELIGIBLE: "This email address is not eligible for FlowForge",
  ACCOUNT_DEACTIVATED: "This account is deactivated; contact the coordinator",
  INVALID_BATCH_YEAR: "The batch year in this email is not valid",
  IDENTITY_CONFLICT:
    "This email already belongs to a different account; contact the coordinator",
};
