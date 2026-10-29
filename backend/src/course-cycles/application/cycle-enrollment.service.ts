import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import {
  StudentEmailCheck,
  StudentPreRegistration,
} from "../../auth/application/student-pre-registration";
import { normalizeEmail } from "../../auth/domain/university-identity-parser";
import { TransactionRunner } from "../../common/transaction";
import { User } from "../../users/domain/user";
import { UsersService } from "../../users/users.service";
import {
  CycleActor,
  CycleAuthorizationPolicy,
} from "../domain/cycle-authorization-policy";
import { CycleDomainError } from "../domain/cycle.errors";
import { CycleRepository } from "./ports/cycle.repository";
import { CycleRoster } from "../domain/cycle-roster";
import { Cycle } from "../domain/cycle.types";
import { EnrollmentRemovalChecks } from "./enrollment-removal-checks";

export interface EnrolledStudent {
  email: string;
  /** Null only for an email enrolled before accounts were pre-registered; enrolling it again registers it. */
  userId: string | null;
  name: string | null;
  /** False until the student first signs in. */
  signedIn: boolean;
  enrolledAt: Date;
}

export interface RejectedEmail {
  email: string;
  reason: string;
}

export interface EnrollmentResult {
  added: string[];
  alreadyEnrolled: string[];
  rejected: RejectedEmail[];
}

/** A student of a core cycle's batch, signed in or pre-registered. */
export interface BatchStudent {
  userId: string;
  email: string;
  name: string;
  signedIn: boolean;
}

export interface BatchImportResult {
  /** Accounts created now; the students have not signed in yet. */
  registered: string[];
  alreadyRegistered: string[];
  rejected: RejectedEmail[];
}

/**
 * Who takes part in a cycle, kept by its faculty: an elective's enrollment
 * list, and the batch list of a core course. Imports accept students before
 * their first sign-in by pre-registering their accounts (ADR 012), so every
 * listed student can be found and placed in a team. An import reports bad
 * rows instead of failing.
 */
@Injectable()
export class CycleEnrollmentService {
  constructor(
    private readonly repository: CycleRepository,
    private readonly policy: CycleAuthorizationPolicy,
    private readonly students: StudentPreRegistration,
    private readonly users: UsersService,
    private readonly removalChecks: EnrollmentRemovalChecks,
    private readonly audit: AuditService,
    private readonly transactions: TransactionRunner,
  ) {}

  async list(actor: CycleActor, cycleId: string): Promise<EnrolledStudent[]> {
    const cycle = await this.getCycle(cycleId);
    this.policy.assertCanManageRoster(actor, cycle);
    const enrollments = await this.repository.listEnrollments(cycle.id);
    const users = await this.users.findByEmails(
      enrollments.map((enrollment) => enrollment.email),
    );
    const byEmail = new Map(users.map((user) => [user.email, user]));
    return enrollments.map((enrollment) => {
      const user = byEmail.get(enrollment.email);
      return {
        email: enrollment.email,
        userId: user?.id ?? null,
        name: user?.name ?? null,
        signedIn: user ? hasSignedIn(user) : false,
        enrolledAt: enrollment.createdAt,
      };
    });
  }

  async add(
    actor: CycleActor,
    cycleId: string,
    rawEmails: readonly string[],
  ): Promise<EnrollmentResult> {
    const cycle = await this.getCycle(cycleId);
    this.policy.assertCanManageRoster(actor, cycle);
    this.assertNotClosed(cycle);
    const { students, rejected } = this.classify(rawEmails);
    const result: EnrollmentResult = {
      added: [],
      alreadyEnrolled: [],
      rejected,
    };
    return this.transactions.run(async (tx) => {
      const enrolled = new Set(
        (await this.repository.listEnrollments(cycle.id, tx)).map(
          (enrollment) => enrollment.email,
        ),
      );
      for (const { email } of students) {
        (enrolled.has(email) ? result.alreadyEnrolled : result.added).push(
          email,
        );
      }
      // Already-enrolled emails are included, so importing again registers an older enrollment too.
      const { created } = await this.students.ensureAccounts(
        actor.id,
        students,
        tx,
      );
      if (result.added.length > 0) {
        await this.repository.addEnrollments(
          cycle.id,
          result.added,
          actor.id,
          tx,
        );
        await this.audit.record(tx, {
          action: "ENROLLMENT_ADDED",
          actorId: actor.id,
          entityType: "CourseProjectCycle",
          entityId: cycle.id,
          metadata: {
            emails: result.added,
            registered: created.map((user) => user.email),
          },
        });
      }
      return result;
    });
  }

  /** A core cycle's batch: every active student of it, signed in or pre-registered. */
  async listBatch(actor: CycleActor, cycleId: string): Promise<BatchStudent[]> {
    const cycle = await this.getCycle(cycleId);
    this.policy.assertCanManageBatch(actor, cycle);
    const users = await this.users.listActiveStudents({
      batchYear: cycle.batchYear,
    });
    return users.map((user) => ({
      userId: user.id,
      email: user.email,
      name: user.name,
      signedIn: hasSignedIn(user),
    }));
  }

  /** Registers students of the cycle's batch who have not signed in yet; other batches are refused. */
  async importBatch(
    actor: CycleActor,
    cycleId: string,
    rawEmails: readonly string[],
  ): Promise<BatchImportResult> {
    const cycle = await this.getCycle(cycleId);
    this.policy.assertCanManageBatch(actor, cycle);
    this.assertNotClosed(cycle);
    const { students, rejected } = this.classify(rawEmails);
    const inBatch = students.filter(
      (student) => student.batchYear === cycle.batchYear,
    );
    for (const student of students) {
      if (student.batchYear !== cycle.batchYear) {
        rejected.push({
          email: student.email,
          reason: `A student of batch ${student.batchYear}, not batch ${cycle.batchYear}`,
        });
      }
    }
    // Report refused rows in the order they were pasted.
    const position = new Map<string, number>();
    rawEmails.forEach((raw, index) => {
      const email = normalizeEmail(raw);
      if (!position.has(email)) position.set(email, index);
    });
    rejected.sort(
      (a, b) => (position.get(a.email) ?? 0) - (position.get(b.email) ?? 0),
    );
    const { created, existing } = await this.transactions.run((tx) =>
      this.students.ensureAccounts(actor.id, inBatch, tx),
    );
    return {
      registered: created.map((user) => user.email),
      alreadyRegistered: existing.map((user) => user.email),
      rejected,
    };
  }

  async remove(
    actor: CycleActor,
    cycleId: string,
    rawEmail: string,
  ): Promise<void> {
    const cycle = await this.getCycle(cycleId);
    this.policy.assertCanManageRoster(actor, cycle);
    this.assertNotClosed(cycle);
    const email = normalizeEmail(rawEmail);
    await this.transactions.run(async (tx) => {
      await this.removalChecks.assertCanRemove(cycle.id, email, tx);
      if (!(await this.repository.removeEnrollment(cycle.id, email, tx))) {
        throw new CycleDomainError(
          "ENROLLMENT_NOT_FOUND",
          "That student is not enrolled in this elective",
        );
      }
      await this.audit.record(tx, {
        action: "ENROLLMENT_REMOVED",
        actorId: actor.id,
        entityType: "CourseProjectCycle",
        entityId: cycle.id,
        metadata: { email },
      });
    });
  }

  /** For modules that build on cycles: who takes part as a student. */
  async rosterOf(
    cycle: Pick<Cycle, "id" | "kind" | "batchYear">,
  ): Promise<CycleRoster> {
    if (cycle.kind === "CORE") return CycleRoster.wholeBatch(cycle.batchYear);
    const enrollments = await this.repository.listEnrollments(cycle.id);
    return CycleRoster.enrolled(
      enrollments.map((enrollment) => enrollment.email),
    );
  }

  /** Enrolled emails with no account (enrolled before pre-registration): they cannot be placed until enrolled again. */
  async notSignedIn(cycle: Pick<Cycle, "id" | "kind">): Promise<string[]> {
    if (cycle.kind === "CORE") return [];
    const emails = (await this.repository.listEnrollments(cycle.id)).map(
      (enrollment) => enrollment.email,
    );
    const known = new Set(
      (await this.users.findByEmails(emails)).map((user) => user.email),
    );
    return emails.filter((email) => !known.has(email));
  }

  /** Student emails of this university, each once; every other row is reported. */
  private classify(rawEmails: readonly string[]): {
    students: { email: string; batchYear: number }[];
    rejected: RejectedEmail[];
  } {
    const seen = new Set<string>();
    const students: { email: string; batchYear: number }[] = [];
    const rejected: RejectedEmail[] = [];
    for (const raw of rawEmails) {
      const check: StudentEmailCheck = this.students.check(raw);
      if (seen.has(check.email)) continue;
      seen.add(check.email);
      if (check.valid) {
        students.push({ email: check.email, batchYear: check.batchYear });
      } else {
        rejected.push({ email: check.email, reason: check.reason });
      }
    }
    return { students, rejected };
  }

  private async getCycle(id: string): Promise<Cycle> {
    const cycle = await this.repository.findById(id);
    if (!cycle) {
      throw new CycleDomainError("CYCLE_NOT_FOUND", "Course cycle not found");
    }
    return cycle;
  }

  private assertNotClosed(cycle: Cycle): void {
    if (cycle.status === "CLOSED") {
      throw new CycleDomainError(
        "CYCLE_ALREADY_CLOSED",
        "A closed cycle's enrollment list cannot change",
      );
    }
  }
}

const hasSignedIn = (user: Pick<User, "lastLoginAt">): boolean =>
  user.lastLoginAt !== null;
