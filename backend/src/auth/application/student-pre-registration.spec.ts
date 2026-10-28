import { AuditService } from "../../audit/audit.service";
import { AuditEvent } from "../../audit/domain/audit-event";
import { FixedClock } from "../../common/testing/fixed-clock";
import { Transaction } from "../../common/transaction";
import { NewUser, User } from "../../users/domain/user";
import { UsersService } from "../../users/users.service";
import { BatchYearPolicy } from "../domain/batch-year.policy";
import { createDocumentedIdentityParser } from "../testing/documented-identity-parser";
import {
  nameFromEmail,
  StudentPreRegistration,
} from "./student-pre-registration";

// Jest cannot load NestJS 12's ES modules on Node 22; stub the decorator the service uses.
jest.mock("@nestjs/common", () => ({
  Injectable: () => (target: unknown) => target,
}));

const DOMAIN = "@nst.rishihood.edu.in";
const tx = {} as Transaction;

function createKit() {
  const stored: User[] = [];
  const audited: AuditEvent[] = [];
  const users = {
    findByEmails: async (emails: readonly string[]) =>
      stored.filter((user) => emails.includes(user.email)),
    register: async (user: NewUser): Promise<User> => {
      const created: User = {
        ...user,
        id: `user-${stored.length + 1}`,
        status: "ACTIVE",
        tokenVersion: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      stored.push(created);
      return created;
    },
  } as unknown as UsersService;
  const registration = new StudentPreRegistration(
    createDocumentedIdentityParser(),
    new BatchYearPolicy(2018, new FixedClock("2026-10-28T09:00:00.000Z")),
    users,
    {
      record: async (_tx: Transaction, event: AuditEvent) => {
        audited.push(event);
      },
    } as unknown as AuditService,
  );
  return { registration, stored, audited };
}

describe("StudentPreRegistration", () => {
  it("accepts student emails with their batch, and explains every other row", () => {
    const { registration } = createKit();
    expect(registration.check(` Aarav.S23csai${DOMAIN} `)).toEqual({
      valid: true,
      email: `aarav.s23csai${DOMAIN}`,
      batchYear: 2023,
    });
    expect(registration.check(`prakriti.p${DOMAIN}`)).toEqual({
      valid: false,
      email: `prakriti.p${DOMAIN}`,
      reason: "A staff email, not a student",
    });
    expect(registration.check("someone@gmail.com")).toMatchObject({
      valid: false,
      reason: "Not a student email of this university",
    });
    expect(registration.check(`old.k10csai${DOMAIN}`)).toMatchObject({
      valid: false,
      reason: expect.stringContaining("Batch year must be between"),
    });
  });

  it("creates accounts without a provider sub for new students only, and audits them", async () => {
    const { registration, stored, audited } = createKit();
    await registration.ensureAccounts(
      "faculty",
      [{ email: `aarav.s23csai${DOMAIN}`, batchYear: 2023 }],
      tx,
    );
    audited.length = 0;
    const result = await registration.ensureAccounts(
      "faculty",
      [
        { email: `aarav.s23csai${DOMAIN}`, batchYear: 2023 },
        { email: `diya.k23csai${DOMAIN}`, batchYear: 2023 },
        { email: `diya.k23csai${DOMAIN}`, batchYear: 2023 },
      ],
      tx,
    );
    expect(result.existing.map((user) => user.email)).toEqual([
      `aarav.s23csai${DOMAIN}`,
    ]);
    expect(result.created).toEqual([
      expect.objectContaining({
        email: `diya.k23csai${DOMAIN}`,
        name: "Diya K",
        googleSub: null,
        role: "STUDENT",
        batchYear: 2023,
        lastLoginAt: null,
      }),
    ]);
    expect(stored).toHaveLength(2);
    expect(audited).toEqual([
      expect.objectContaining({
        action: "USER_CREATED",
        actorId: "faculty",
        metadata: expect.objectContaining({ reason: "PRE_REGISTERED" }),
      }),
      expect.objectContaining({
        action: "ROLE_ASSIGNED",
        metadata: { from: null, to: "STUDENT", reason: "PRE_REGISTERED" },
      }),
    ]);
  });

  it.each([
    ["aarav.s23csai@nst.rishihood.edu.in", "Aarav S"],
    ["rahul.25@nst.rishihood.edu.in", "Rahul"],
    ["neha.t26csai@nst.rishihood.edu.in", "Neha T"],
  ])("names %s %s until the first sign-in", (email, name) => {
    expect(nameFromEmail(email)).toBe(name);
  });
});
