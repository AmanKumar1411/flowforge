import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { Transaction, TransactionRunner } from "../../common/transaction";
import { AppConfig } from "../../config/app-config";
import { User } from "../../users/domain/user";
import { UsersService } from "../../users/users.service";
import { AuthDomainError } from "../domain/auth.errors";
import { BatchYearPolicy } from "../domain/batch-year.policy";
import { Role } from "../domain/role";
import { UniversityIdentityParser } from "../domain/university-identity-parser";
import { DemoAccount, demoAccounts } from "./demo-accounts";
import { FacultyAccessService } from "./faculty-access.service";
import { DevIdentityProvider, devSubject } from "./ports/dev-identity-provider";

export interface ListedDemoAccount extends DemoAccount {
  batchYear: number | null;
}

export type DemoSeedOutcome =
  "CREATED" | "ROLE_CHANGED" | "UNCHANGED" | "SKIPPED";

export interface SeededDemoAccount {
  email: string;
  name: string;
  /** The role the account has now, which a skipped account may not have. */
  role: Role | null;
  batchYear: number | null;
  outcome: DemoSeedOutcome;
  note: string | null;
}

type Resolved =
  | { usable: true; account: ListedDemoAccount }
  | { usable: false; account: DemoAccount; problem: string };

type Draft =
  | { account: ListedDemoAccount; user: User; roleBefore: Role | null }
  | { account: DemoAccount; skipped: string };

/**
 * Creates the demo accounts ahead of their first dev login, so admins and
 * faculty already have their roles and students already appear in team
 * search. Works only where dev login works. Running it again changes nothing,
 * except that a demo admin or faculty member who lost that role gets it back.
 */
@Injectable()
export class DemoAccountsService {
  constructor(
    private readonly devIdentity: DevIdentityProvider,
    private readonly identityParser: UniversityIdentityParser,
    private readonly batchYearPolicy: BatchYearPolicy,
    private readonly users: UsersService,
    private readonly facultyAccess: FacultyAccessService,
    private readonly audit: AuditService,
    private readonly transactions: TransactionRunner,
    private readonly config: AppConfig,
  ) {}

  /** The demo accounts that fit this university's email rules, for the dev login form. */
  list(): ListedDemoAccount[] {
    this.devIdentity.assertEnabled();
    return this.resolve().flatMap((entry) =>
      entry.usable ? [entry.account] : [],
    );
  }

  async seed(): Promise<SeededDemoAccount[]> {
    this.devIdentity.assertEnabled();
    const drafts = await this.transactions.run(async (tx) => {
      const created: Draft[] = [];
      for (const entry of this.resolve()) {
        created.push(await this.upsert(entry, tx));
      }
      return created;
    });
    await this.allowlistFaculty(drafts);
    return Promise.all(drafts.map((draft) => this.report(draft)));
  }

  private resolve(): Resolved[] {
    return demoAccounts(this.config.values.allowedHostedDomain).map(
      (account): Resolved => {
        const identity = this.identityParser.parse(account.email);
        const expected = account.role === "STUDENT" ? "STUDENT" : "STAFF";
        if (identity.kind !== expected) {
          return {
            usable: false,
            account,
            problem: `Does not match ${expected}_EMAIL_PATTERN`,
          };
        }
        if (identity.kind !== "STUDENT") {
          return { usable: true, account: { ...account, batchYear: null } };
        }
        try {
          this.batchYearPolicy.assertValid(identity.batchYear);
        } catch (error) {
          if (!(error instanceof AuthDomainError)) throw error;
          return { usable: false, account, problem: error.message };
        }
        return {
          usable: true,
          account: { ...account, batchYear: identity.batchYear },
        };
      },
    );
  }

  private async upsert(entry: Resolved, tx: Transaction): Promise<Draft> {
    if (!entry.usable) {
      return { account: entry.account, skipped: entry.problem };
    }
    const { account } = entry;
    const existing = await this.users.findByEmail(account.email, tx);
    if (!existing) {
      return {
        account,
        user: await this.create(account, tx),
        roleBefore: null,
      };
    }
    // A pre-registered account (no sub yet) is claimed by its first dev login, like any other.
    if (
      existing.googleSub !== null &&
      existing.googleSub !== devSubject(account.email)
    ) {
      return {
        account,
        skipped: "Signed in with Google before, so dev login cannot use it",
      };
    }
    if (existing.status === "DEACTIVATED") {
      return { account, skipped: "Deactivated; reactivate it from Admin" };
    }
    if (account.role === "ADMIN" && existing.role !== "ADMIN") {
      const user = await this.users.changeRole(existing.id, "ADMIN", tx);
      await this.recordRole(user.id, existing.role, "ADMIN", tx);
      return { account, user, roleBefore: existing.role };
    }
    return { account, user: existing, roleBefore: existing.role };
  }

  private async create(account: ListedDemoAccount, tx: Transaction) {
    const user = await this.users.register(
      {
        googleSub: devSubject(account.email),
        email: account.email,
        name: account.name,
        avatarUrl: null,
        role: account.role,
        batchYear: account.batchYear,
        lastLoginAt: null,
      },
      tx,
    );
    await this.audit.record(tx, {
      action: "USER_CREATED",
      actorId: null,
      entityType: "User",
      entityId: user.id,
      metadata: {
        email: user.email,
        batchYear: user.batchYear,
        reason: "DEMO_SEED",
      },
    });
    await this.recordRole(user.id, null, account.role, tx);
    return user;
  }

  /** Faculty keep their role on login only while on the allowlist, which the faculty access service owns. */
  private async allowlistFaculty(drafts: Draft[]): Promise<void> {
    const ready = drafts.flatMap((draft) => ("user" in draft ? [draft] : []));
    const admin = ready.find(
      ({ user }) => user.role === "ADMIN" && user.status === "ACTIVE",
    );
    const allowlisted = new Set(
      (await this.facultyAccess.listAllowlist()).map((entry) => entry.email),
    );
    for (const { account } of ready) {
      if (account.role !== "FACULTY" || allowlisted.has(account.email)) {
        continue;
      }
      if (!admin) {
        throw new Error("No active demo admin to add faculty to the allowlist");
      }
      await this.facultyAccess.addToAllowlist(
        admin.user.id,
        account.email,
        account.name,
      );
    }
  }

  private async report(draft: Draft): Promise<SeededDemoAccount> {
    if ("skipped" in draft) {
      const user = await this.users.findByEmail(draft.account.email);
      return {
        email: draft.account.email,
        name: draft.account.name,
        role: user?.role ?? null,
        batchYear: user?.batchYear ?? null,
        outcome: "SKIPPED",
        note: draft.skipped,
      };
    }
    const user =
      (await this.users.findByEmail(draft.account.email)) ?? draft.user;
    let outcome: DemoSeedOutcome = "UNCHANGED";
    if (draft.roleBefore === null) outcome = "CREATED";
    else if (user.role !== draft.roleBefore) outcome = "ROLE_CHANGED";
    return {
      email: user.email,
      name: user.name,
      role: user.role,
      batchYear: user.batchYear,
      outcome,
      note: null,
    };
  }

  private recordRole(
    userId: string,
    from: Role | null,
    to: Role,
    tx: Transaction,
  ): Promise<void> {
    return this.audit.record(tx, {
      action: "ROLE_ASSIGNED",
      actorId: null,
      entityType: "User",
      entityId: userId,
      metadata: { from, to, reason: "DEMO_SEED" },
    });
  }
}
