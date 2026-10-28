import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { Transaction } from "../../common/transaction";
import { User } from "../../users/domain/user";
import { UsersService } from "../../users/users.service";
import { AuthDomainError } from "../domain/auth.errors";
import { BatchYearPolicy } from "../domain/batch-year.policy";
import {
  normalizeEmail,
  UniversityIdentityParser,
} from "../domain/university-identity-parser";

export type StudentEmailCheck =
  | { valid: true; email: string; batchYear: number }
  | { valid: false; email: string; reason: string };

export interface StudentAccounts {
  /** Accounts created now, waiting for their first sign-in. */
  created: User[];
  /** Accounts that already existed, signed in or not. */
  existing: User[];
}

/**
 * Creates student accounts from a faculty import before the students first
 * sign in (ADR 012), so they can be listed, found and placed in teams. Such
 * an account has no provider sub; the first sign-in with its email claims it.
 * The email rules are the sign-in rules: a student shape and a valid batch.
 */
@Injectable()
export class StudentPreRegistration {
  constructor(
    private readonly identityParser: UniversityIdentityParser,
    private readonly batchYearPolicy: BatchYearPolicy,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  /** Whether an imported row is a student email of this university, and of which batch. */
  check(rawEmail: string): StudentEmailCheck {
    const email = normalizeEmail(rawEmail);
    const identity = this.identityParser.parse(email);
    if (identity.kind !== "STUDENT") {
      return {
        valid: false,
        email,
        reason:
          identity.kind === "STAFF"
            ? "A staff email, not a student"
            : "Not a student email of this university",
      };
    }
    try {
      this.batchYearPolicy.assertValid(identity.batchYear);
    } catch (error) {
      if (!(error instanceof AuthDomainError)) throw error;
      return { valid: false, email, reason: error.message };
    }
    return { valid: true, email, batchYear: identity.batchYear };
  }

  /** Makes sure each checked student has an account, creating the missing ones. */
  async ensureAccounts(
    actorId: string,
    students: readonly { email: string; batchYear: number }[],
    tx: Transaction,
  ): Promise<StudentAccounts> {
    const existing = await this.users.findByEmails(
      students.map((student) => student.email),
      tx,
    );
    const known = new Set(existing.map((user) => user.email));
    const created: User[] = [];
    for (const student of students) {
      if (known.has(student.email)) continue;
      known.add(student.email);
      created.push(await this.create(actorId, student, tx));
    }
    return { created, existing };
  }

  private async create(
    actorId: string,
    student: { email: string; batchYear: number },
    tx: Transaction,
  ): Promise<User> {
    const user = await this.users.register(
      {
        googleSub: null,
        email: student.email,
        name: nameFromEmail(student.email),
        avatarUrl: null,
        role: "STUDENT",
        batchYear: student.batchYear,
        lastLoginAt: null,
      },
      tx,
    );
    await this.audit.record(tx, {
      action: "USER_CREATED",
      actorId,
      entityType: "User",
      entityId: user.id,
      metadata: {
        email: user.email,
        batchYear: user.batchYear,
        reason: "PRE_REGISTERED",
      },
    });
    await this.audit.record(tx, {
      action: "ROLE_ASSIGNED",
      actorId,
      entityType: "User",
      entityId: user.id,
      metadata: { from: null, to: "STUDENT", reason: "PRE_REGISTERED" },
    });
    return user;
  }
}

/**
 * A readable stand-in until the student's first sign-in brings their real name:
 * "aarav.s23csai@…" becomes "Aarav S".
 */
export function nameFromEmail(email: string): string {
  const [first = "", second = ""] = email
    .slice(0, email.indexOf("@"))
    .split(".");
  const initial = /^[a-z]/.exec(second)?.[0];
  const capitalized = first.charAt(0).toUpperCase() + first.slice(1);
  return initial ? `${capitalized} ${initial.toUpperCase()}` : capitalized;
}
