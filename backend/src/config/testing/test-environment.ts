import { AppConfig } from "../app-config";
import { parseEnvironment } from "../env.validation";

/** A complete, valid environment for unit and integration tests. */
export const testEnvironment = (): Record<string, string> => ({
  NODE_ENV: "test",
  PORT: "3000",
  DATABASE_URL: "postgresql://flowforge:password@localhost:5432/flowforge_test",
  FRONTEND_URL: "http://localhost:5173",
  COOKIE_SECRET: "test-cookie-secret-that-is-at-least-32-characters",
  GOOGLE_CLIENT_ID: "test-client-id.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "test-client-secret",
  GOOGLE_REDIRECT_URI: "http://localhost:3000/api/auth/google/callback",
  ALLOWED_HOSTED_DOMAIN: "nst.rishihood.edu.in",
  STUDENT_EMAIL_PATTERN:
    "^[a-z]+\\.[a-z]*(\\d{2})[a-z]*@nst\\.rishihood\\.edu\\.in$",
  STAFF_EMAIL_PATTERN: "^[a-z]+\\.[a-z]+\\d?@nst\\.rishihood\\.edu\\.in$",
  BATCH_BASE_YEAR: "2000",
  BATCH_MIN_YEAR: "2018",
  ADMIN_BOOTSTRAP_EMAILS: "coordinator.x@nst.rishihood.edu.in",
  JWT_ACCESS_SECRET: "test-access-secret-that-is-at-least-32-characters",
  JWT_ISSUER: "flowforge-api",
  JWT_AUDIENCE: "flowforge-web",
  ACCESS_TOKEN_TTL: "15m",
  REFRESH_TOKEN_TTL_DAYS: "1",
  REFRESH_FAMILY_MAX_DAYS: "1",
  AUTH_DEV_LOGIN_ENABLED: "true",
  AUTH_LOGIN_RATE_LIMIT_PER_MINUTE: "10000",
  AUTH_REFRESH_RATE_LIMIT_PER_MINUTE: "10000",
});

export const createTestAppConfig = (
  overrides: Record<string, string> = {},
): AppConfig =>
  new AppConfig(parseEnvironment({ ...testEnvironment(), ...overrides }));
