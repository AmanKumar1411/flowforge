import { validateEnvironment } from "./env.validation";

const validEnvironment = {
  DATABASE_URL: "postgresql://flowforge:password@localhost:5432/flowforge",
  JWT_SECRET: "a-local-secret-that-is-at-least-32-characters-long",
  ALLOWED_UNIVERSITY_EMAIL_DOMAINS: "nst.rishihood.edu.in",
  BATCH_EMAIL_PATTERN: "^[a-z0-9]+\\.k(?<batch>\\d{2})[a-z0-9]*$",
  BATCH_BASE_YEAR: "2000",
  CORS_ORIGIN: "http://localhost:5173",
  PORT: "3000",
};

describe("validateEnvironment", () => {
  it("accepts the documented batch regex and normalizes values", () => {
    expect(validateEnvironment(validEnvironment)).toMatchObject({
      BATCH_EMAIL_PATTERN: validEnvironment.BATCH_EMAIL_PATTERN,
      BATCH_BASE_YEAR: "2000",
      PORT: "3000",
    });
  });

  it("rejects invalid database URLs", () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, DATABASE_URL: "not-a-url" }),
    ).toThrow("DATABASE_URL must be a valid PostgreSQL URL");
  });

  it("rejects unanchored or missing batch capture patterns", () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        BATCH_EMAIL_PATTERN: "[a-z]+",
      }),
    ).toThrow("BATCH_EMAIL_PATTERN must be a short, anchored, safe regex");
  });
});
