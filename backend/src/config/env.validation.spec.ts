import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "dotenv";
import { ENVIRONMENT_KEYS } from "./app-config";
import { parseEnvironment, validateEnvironment } from "./env.validation";
import { testEnvironment } from "./testing/test-environment";

const withEnv = (overrides: Record<string, string | undefined>) =>
  parseEnvironment({ ...testEnvironment(), ...overrides });

describe("parseEnvironment", () => {
  it("types and normalizes a valid environment", () => {
    const config = withEnv({ FRONTEND_URL: "http://localhost:5173/" });

    expect(config.frontendUrl).toBe("http://localhost:5173");
    expect(config.jwt.accessTokenTtlSeconds).toBe(900);
    expect(config.sessions).toEqual({
      refreshTokenTtlDays: 7,
      refreshFamilyMaxDays: 30,
    });
    expect(
      config.identity.studentEmailPattern.exec(
        "aman.k23csai@nst.rishihood.edu.in",
      )?.[1],
    ).toBe("23");
    expect([...config.adminBootstrapEmails]).toEqual([
      "coordinator.x@nst.rishihood.edu.in",
    ]);
    expect(config.devLoginEnabled).toBe(true);
  });

  it("returns the raw values unchanged for ConfigService", () => {
    expect(validateEnvironment(testEnvironment())).toEqual(testEnvironment());
  });

  it("documents every variable it reads in .env.example", () => {
    const documented = parse(
      readFileSync(join(__dirname, "..", "..", ".env.example")),
    );
    expect(ENVIRONMENT_KEYS.filter((key) => !(key in documented))).toEqual([]);
  });

  it.each([
    "DATABASE_URL",
    "FRONTEND_URL",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "JWT_ACCESS_SECRET",
    "COOKIE_SECRET",
    "STUDENT_EMAIL_PATTERN",
    "STAFF_EMAIL_PATTERN",
    "BATCH_MIN_YEAR",
    "ALLOWED_HOSTED_DOMAIN",
  ])("names the missing variable %s", (key) => {
    expect(() => withEnv({ [key]: undefined })).toThrow(
      `Missing required environment variable: ${key}`,
    );
  });

  it("refuses to start with dev login enabled in production", () => {
    expect(() =>
      withEnv({ NODE_ENV: "production", AUTH_DEV_LOGIN_ENABLED: "true" }),
    ).toThrow(
      "AUTH_DEV_LOGIN_ENABLED must be false when NODE_ENV is production",
    );
    expect(
      withEnv({ NODE_ENV: "production", AUTH_DEV_LOGIN_ENABLED: "false" })
        .devLoginEnabled,
    ).toBe(false);
  });

  it.each([
    ["aman.k23csai@nst.rishihood.edu.in", "STUDENT_EMAIL_CANNOT_BE_ELEVATED"],
    ["prakriti.p@gmail.com", "INVALID_STAFF_EMAIL"],
  ])("rejects the bootstrap admin %s with %s", (email, code) => {
    expect(() => withEnv({ ADMIN_BOOTSTRAP_EMAILS: email })).toThrow(
      `ADMIN_BOOTSTRAP_EMAILS contains ${email}: ${code}`,
    );
  });

  it("rejects a student pattern without a capture group for the year", () => {
    expect(() =>
      withEnv({
        STUDENT_EMAIL_PATTERN:
          "^[a-z]+\\.[a-z]*\\d{2}[a-z]*@nst\\.rishihood\\.edu\\.in$",
      }),
    ).toThrow("STUDENT_EMAIL_PATTERN must capture the two-digit year");
  });

  it.each([
    ["STUDENT_EMAIL_PATTERN", "[a-z]+(\\d{2})"],
    ["STAFF_EMAIL_PATTERN", "^[a-z]+"],
    ["STAFF_EMAIL_PATTERN", "^(a+)+$"],
    ["STUDENT_EMAIL_PATTERN", "^(?<=a)(\\d{2})$"],
  ])("rejects the unanchored or unsafe %s %s", (key, pattern) => {
    expect(() => withEnv({ [key]: pattern })).toThrow(
      `${key} must be a short, anchored, safe regex`,
    );
  });

  it("rejects an invalid regex", () => {
    expect(() => withEnv({ STAFF_EMAIL_PATTERN: "^[a-z$" })).toThrow(
      "STAFF_EMAIL_PATTERN must be a valid regex",
    );
  });

  it.each([
    [{ DATABASE_URL: "not-a-url" }, "DATABASE_URL must be a valid URL"],
    [{ DATABASE_URL: "mysql://x@localhost/db" }, "postgres or postgresql"],
    [{ BATCH_MIN_YEAR: "18" }, "BATCH_MIN_YEAR must be a four-digit integer"],
    [{ JWT_ACCESS_SECRET: "short" }, "at least 32 characters"],
    [
      { COOKIE_SECRET: testEnvironment()["JWT_ACCESS_SECRET"] },
      "must be different",
    ],
    [{ ACCESS_TOKEN_TTL: "15" }, "ACCESS_TOKEN_TTL must be a duration"],
    [{ ACCESS_TOKEN_TTL: "2h" }, "ACCESS_TOKEN_TTL must be a duration"],
    [{ REFRESH_FAMILY_MAX_DAYS: "3" }, "at least REFRESH_TOKEN_TTL_DAYS"],
    [{ AUTH_DEV_LOGIN_ENABLED: "yes" }, '"true" or "false"'],
    [{ NODE_ENV: "staging" }, "NODE_ENV must be"],
    [{ ALLOWED_HOSTED_DOMAIN: "localhost" }, "ALLOWED_HOSTED_DOMAIN must be"],
  ])("rejects %j", (overrides, message) => {
    expect(() => withEnv(overrides)).toThrow(message);
  });
});
