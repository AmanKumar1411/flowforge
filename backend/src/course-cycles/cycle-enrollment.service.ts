import { Injectable } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import {
  normalizeEmail,
  UniversityIdentityParser,
} from "../auth/domain/university-identity-parser";
import { TransactionRunner } from "../common/transaction";
import { UsersService } from "../users/users.service";
import {
  CycleActor,
  CycleAuthorizationPolicy,
} from "./domain/cycle-authorization-policy";
import { CycleDomainError } from "./domain/cycle.errors";
import { CycleRepository } from "./domain/cycle-repository";
import { CycleRoster } from "./domain/cycle-roster";
import { Cycle } from "./domain/cycle.types";
import { EnrollmentRemovalChecks } from "./enrollment-removal-checks";

export interface EnrolledStudent {
  email: string;
  /** Null until the student signs in for the first time. */
  userId: string | null;
  name: string | null;
  enrolledAt: Date;
}

export interface EnrollmentResult {
  added: string[];
  alreadyEnrolled: string[];
  rejected: { email: string; reason: string }[];
}

/**
 * Elective rosters, kept by the cycle's faculty. Emails are accepted before
 * the student's first sign-in; an import reports bad rows instead of failing.
 */
@Injectable()
export class CycleEnrollmentService {
  constructor(
    private readonly repository: CycleRepository,
    private readonly policy: CycleAuthorizationPolicy,
    private readonly identities: UniversityIdentityParser,
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
    const result: EnrollmentResult = {
      added: [],
      alreadyEnrolled: [],
      rejected: [],
    };
    const candidates = new Set<string>();
    const seen = new Set<string>();
    for (const raw of rawEmails) {
      const email = normalizeEmail(raw);
      if (seen.has(email)) continue;
      seen.add(email);
      const identity = this.identities.parse(email);
      if (identity.kind === "STUDENT") {
        candidates.add(email);
      } else {
        result.rejected.push({
          email,
          reason:
            identity.kind === "STAFF"
              ? "A staff email, not a student"
              : "Not a student email of this university",
        });
      }
    }
    return this.transactions.run(async (tx) => {
      const enrolled = new Set(
        (await this.repository.listEnrollments(cycle.id, tx)).map(
          (enrollment) => enrollment.email,
        ),
      );
      for (const email of candidates) {
        (enrolled.has(email) ? result.alreadyEnrolled : result.added).push(
          email,
        );
      }
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
          metadata: { emails: result.added },
        });
      }
      return result;
    });
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

  /** Enrolled emails with no account yet: they cannot be placed in a team. */
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
