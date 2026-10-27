import { createDocumentedIdentityParser } from "../testing/documented-identity-parser";
import { demoAccounts } from "./demo-accounts";

const parser = createDocumentedIdentityParser();
const accounts = demoAccounts("nst.rishihood.edu.in");

describe("demo accounts", () => {
  it("fit the documented email rules: students as students, everyone else as staff", () => {
    for (const account of accounts) {
      expect(parser.parse(account.email).kind).toBe(
        account.role === "STUDENT" ? "STUDENT" : "STAFF",
      );
    }
  });

  it("have two students in each of the batches 2023 to 2026", () => {
    const batches = accounts.flatMap((account) => {
      const identity = parser.parse(account.email);
      return identity.kind === "STUDENT" ? [identity.batchYear] : [];
    });
    expect(batches).toEqual([2023, 2023, 2024, 2024, 2025, 2025, 2026, 2026]);
  });

  it("include an admin, two coordinators (admins) and two faculty, all with distinct emails", () => {
    expect(accounts.filter((account) => account.role === "ADMIN")).toHaveLength(
      3,
    );
    expect(
      accounts.filter((account) => account.role === "FACULTY"),
    ).toHaveLength(2);
    expect(new Set(accounts.map((account) => account.email)).size).toBe(
      accounts.length,
    );
  });
});
