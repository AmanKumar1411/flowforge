import {
  normalizeEmail,
  UniversityIdentity,
  UniversityIdentityParser,
} from "../domain/university-identity-parser";

export interface IdentityPatterns {
  /** Full-address pattern whose first capture group is the two-digit admission year. */
  studentEmailPattern: RegExp;
  staffEmailPattern: RegExp;
  batchBaseYear: number;
}

export class RishihoodIdentityParser extends UniversityIdentityParser {
  constructor(private readonly patterns: IdentityPatterns) {
    super();
  }

  parse(email: string): UniversityIdentity {
    const normalizedEmail = normalizeEmail(email);

    const student = this.patterns.studentEmailPattern.exec(normalizedEmail);
    if (student) {
      return {
        kind: "STUDENT",
        email: normalizedEmail,
        batchYear: this.patterns.batchBaseYear + Number(student[1]),
      };
    }

    if (this.patterns.staffEmailPattern.test(normalizedEmail)) {
      return { kind: "STAFF", email: normalizedEmail };
    }

    return { kind: "UNRECOGNIZED", email: normalizedEmail };
  }
}
