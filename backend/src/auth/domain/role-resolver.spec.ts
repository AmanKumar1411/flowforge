import { createDocumentedIdentityParser } from "../testing/documented-identity-parser";
import { AuthDomainError } from "./auth.errors";
import { Role, UserStatus } from "./role";
import { RoleResolutionInput, RoleResolver } from "./role-resolver";

const parser = createDocumentedIdentityParser();
const resolver = new RoleResolver();

const input = (
  localPart: string,
  overrides: Partial<Omit<RoleResolutionInput, "identity">> = {},
): RoleResolutionInput => ({
  identity: parser.parse(`${localPart}@nst.rishihood.edu.in`),
  existingUser: null,
  isBootstrapAdmin: false,
  isApprovedFaculty: false,
  ...overrides,
});

const existing = (role: Role, status: UserStatus = "ACTIVE") => ({
  role,
  status,
});

describe("RoleResolver", () => {
  it.each(["aman.k23csai", "rahul.25"])(
    "assigns STUDENT to the student email %s",
    (localPart) => {
      expect(resolver.resolve(input(localPart))).toEqual({
        outcome: "ASSIGNED",
        role: "STUDENT",
      });
    },
  );

  it("assigns ADMIN to a bootstrap staff email", () => {
    expect(
      resolver.resolve(input("prakriti.p", { isBootstrapAdmin: true })),
    ).toEqual({ outcome: "ASSIGNED", role: "ADMIN" });
  });

  it("keeps ADMIN for an existing admin who is no longer in bootstrap config", () => {
    expect(
      resolver.resolve(
        input("prakriti.p", { existingUser: existing("ADMIN") }),
      ),
    ).toEqual({ outcome: "ASSIGNED", role: "ADMIN" });
  });

  it("assigns FACULTY to an approved staff email", () => {
    expect(
      resolver.resolve(input("vatsala.s", { isApprovedFaculty: true })),
    ).toEqual({ outcome: "ASSIGNED", role: "FACULTY" });
  });

  it.each(["prakriti.p", "sahil.a", "sahil.a2"])(
    "assigns PENDING_STAFF to the unlisted staff email %s",
    (localPart) => {
      expect(resolver.resolve(input(localPart))).toEqual({
        outcome: "ASSIGNED",
        role: "PENDING_STAFF",
      });
    },
  );

  it("moves former faculty removed from the allowlist back to PENDING_STAFF", () => {
    expect(
      resolver.resolve(input("sahil.a", { existingUser: existing("FACULTY") })),
    ).toEqual({ outcome: "ASSIGNED", role: "PENDING_STAFF" });
  });

  it.each(["rahul.2025", "rahul.5", "sahil.a123"])(
    "denies %s, which matches neither shape",
    (localPart) => {
      expect(resolver.resolve(input(localPart))).toEqual({
        outcome: "DENIED",
        code: "EMAIL_NOT_ELIGIBLE",
      });
    },
  );

  it("denies a non-university address", () => {
    expect(
      resolver.resolve({
        ...input("aman.k23csai"),
        identity: parser.parse("aman.k23csai@gmail.com"),
      }),
    ).toEqual({ outcome: "DENIED", code: "EMAIL_NOT_ELIGIBLE" });
  });

  it.each([
    ["aman.k23csai", "STUDENT"],
    ["vatsala.s", "FACULTY"],
    ["prakriti.p", "ADMIN"],
    ["sahil.a", "PENDING_STAFF"],
  ] as const)(
    "denies the deactivated account %s before any other rule",
    (localPart, role) => {
      expect(
        resolver.resolve(
          input(localPart, {
            existingUser: existing(role, "DEACTIVATED"),
            isBootstrapAdmin: true,
            isApprovedFaculty: true,
          }),
        ),
      ).toEqual({ outcome: "DENIED", code: "ACCOUNT_DEACTIVATED" });
    },
  );

  it.each([
    ["on the faculty allowlist", { isApprovedFaculty: true }],
    ["in bootstrap admin config", { isBootstrapAdmin: true }],
    ["stored as ADMIN", { existingUser: existing("ADMIN") }],
    ["stored as FACULTY", { existingUser: existing("FACULTY") }],
  ])("never elevates a student email %s", (_, overrides) => {
    expect(resolver.resolve(input("aman.k23csai", overrides))).toEqual({
      outcome: "ASSIGNED",
      role: "STUDENT",
    });
  });

  describe("assertCanBeElevated", () => {
    it("accepts a staff email", () => {
      expect(() =>
        resolver.assertCanBeElevated(
          parser.parse("sahil.a@nst.rishihood.edu.in"),
        ),
      ).not.toThrow();
    });

    it.each([
      ["aman.k23csai@nst.rishihood.edu.in", "STUDENT_EMAIL_CANNOT_BE_ELEVATED"],
      ["rahul.25@nst.rishihood.edu.in", "STUDENT_EMAIL_CANNOT_BE_ELEVATED"],
      ["sahil.a123@nst.rishihood.edu.in", "INVALID_STAFF_EMAIL"],
      ["prakriti.p@gmail.com", "INVALID_STAFF_EMAIL"],
    ])("rejects %s with %s", (email, code) => {
      expect(() => resolver.assertCanBeElevated(parser.parse(email))).toThrow(
        expect.objectContaining({ code }) as AuthDomainError,
      );
    });
  });
});
