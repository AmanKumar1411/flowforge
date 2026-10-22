import { ConfigService } from "@nestjs/config";
import {
  InvalidUniversityIdentityError,
  UniversityIdentityParser,
} from "../domain/university-identity-parser";
import { RishihoodIdentityParser } from "./rishihood-identity-parser";

jest.mock("@nestjs/common", () => ({
  Injectable: () => (target: unknown) => target,
}));
jest.mock("@nestjs/config", () => ({
  ConfigService: class ConfigService {},
}));

const config = {
  ALLOWED_UNIVERSITY_EMAIL_DOMAINS: "nst.rishihood.edu.in",
  BATCH_EMAIL_PATTERN: "^[a-z0-9]+\\.k(?<batch>\\d{2})[a-z0-9]*$",
  BATCH_BASE_YEAR: "2000",
};

const createParser = (): UniversityIdentityParser =>
  new RishihoodIdentityParser({
    getOrThrow: <T>(key: keyof typeof config): T => config[key] as T,
  } as ConfigService);

describe("RishihoodIdentityParser", () => {
  it.each([
    ["aman.k23csai@nst.rishihood.edu.in", 2023],
    ["student.k24csai@nst.rishihood.edu.in", 2024],
    ["student.k25csai@nst.rishihood.edu.in", 2025],
    ["  AMAN.K23CSAI@NST.RISHIHOOD.EDU.IN  ", 2023],
  ])("extracts batch year for %s", (email, batchYear) => {
    expect(createParser().parse(email)).toEqual({
      email: email.trim().toLowerCase(),
      batchYear,
    });
  });

  it.each([
    "student@gmail.com",
    "invalid-email",
    "user@nst.rishihood.edu.in.evil.com",
  ])("rejects %s outside the accepted university identity format", (email) => {
    expect(() => createParser().parse(email)).toThrow(
      InvalidUniversityIdentityError,
    );
  });

  it("returns null when a valid university email has no batch token", () => {
    expect(createParser().parse("student@nst.rishihood.edu.in")).toEqual({
      email: "student@nst.rishihood.edu.in",
      batchYear: null,
    });
  });
});
