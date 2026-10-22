export interface UniversityIdentity {
  email: string;
  batchYear: number | null;
}

export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();

export abstract class UniversityIdentityParser {
  abstract parse(email: string): UniversityIdentity;
}

export class InvalidUniversityIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidUniversityIdentityError";
  }
}
