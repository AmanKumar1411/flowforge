import type { Role, UserStatus } from "../../auth/domain/role";

/** What the roster needs to know about a person. */
export interface RosterCandidate {
  role: Role;
  status: UserStatus;
  batchYear: number | null;
  email: string;
}

export type RosterScope =
  | { kind: "BATCH"; batchYear: number }
  | { kind: "ENROLLED"; emails: ReadonlySet<string> };

/**
 * Who takes part in a cycle as a student: the whole batch for a core course,
 * the enrolled emails for an elective. Team rules ask the roster, so they
 * never repeat the core/elective distinction.
 */
export class CycleRoster {
  private constructor(readonly scope: RosterScope) {}

  static wholeBatch(batchYear: number): CycleRoster {
    return new CycleRoster({ kind: "BATCH", batchYear });
  }

  static enrolled(emails: Iterable<string>): CycleRoster {
    return new CycleRoster({ kind: "ENROLLED", emails: new Set(emails) });
  }

  includes(person: RosterCandidate): boolean {
    if (person.role !== "STUDENT" || person.status !== "ACTIVE") return false;
    return this.scope.kind === "BATCH"
      ? person.batchYear === this.scope.batchYear
      : this.scope.emails.has(person.email);
  }

  describe(): string {
    return this.scope.kind === "BATCH"
      ? `an active student of batch ${this.scope.batchYear}`
      : "an active student enrolled in this elective";
  }
}
