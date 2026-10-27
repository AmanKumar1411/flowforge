export type StudentIdentity = {
  kind: "STUDENT";
  email: string;
  batchYear: number;
};

export type StaffIdentity = { kind: "STAFF"; email: string };

export type UnrecognizedIdentity = { kind: "UNRECOGNIZED"; email: string };

/**
 * What the email shape says about a person. It separates students from staff,
 * never faculty from other staff: faculty status always needs approval.
 */
export type UniversityIdentity =
  StudentIdentity | StaffIdentity | UnrecognizedIdentity;

export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();

export abstract class UniversityIdentityParser {
  abstract parse(email: string): UniversityIdentity;
}
