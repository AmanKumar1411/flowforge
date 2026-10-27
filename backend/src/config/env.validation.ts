import { AuthDomainError } from "../auth/domain/auth.errors";
import { RoleResolver } from "../auth/domain/role-resolver";
import { normalizeEmail } from "../auth/domain/university-identity-parser";
import { RishihoodIdentityParser } from "../auth/infrastructure/rishihood-identity-parser";

type Environment = Record<string, unknown>;

export type NodeEnvironment = "development" | "test" | "production";

export interface AppConfigValues {
  nodeEnv: NodeEnvironment;
  port: number;
  databaseUrl: string;
  frontendUrl: string;
  cookieSecret: string;
  google: { clientId: string; clientSecret: string; redirectUri: string };
  allowedHostedDomain: string;
  identity: {
    studentEmailPattern: RegExp;
    staffEmailPattern: RegExp;
    batchBaseYear: number;
    batchMinYear: number;
  };
  adminBootstrapEmails: ReadonlySet<string>;
  jwt: {
    accessSecret: string;
    issuer: string;
    audience: string;
    accessTokenTtlSeconds: number;
  };
  sessions: { refreshTokenTtlDays: number; refreshFamilyMaxDays: number };
  devLoginEnabled: boolean;
  rateLimits: { loginPerMinute: number; refreshPerMinute: number };
}

// Rejects backreferences, lookarounds and nested quantifiers to keep matching linear.
const unsafeRegexSyntax =
  /\\[1-9]|\(\?(?!<[a-z]+>)[:=!<]|\([^)]*[+*][^)]*\)[+*{]/;

class EnvironmentReader {
  constructor(private readonly env: Environment) {}

  required(key: string): string {
    const value = this.env[key];
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return value.trim();
  }

  optional(key: string): string | undefined {
    const value = this.env[key];
    return typeof value === "string" && value.trim() !== ""
      ? value.trim()
      : undefined;
  }

  secret(key: string): string {
    const value = this.required(key);
    if (value.length < 32) {
      throw new Error(`${key} must be at least 32 characters long`);
    }
    return value;
  }

  url(key: string): URL {
    const value = this.required(key);
    try {
      return new URL(value);
    } catch {
      throw new Error(`${key} must be a valid URL`);
    }
  }

  integer(key: string, min: number, max: number, fallback?: number): number {
    const raw =
      fallback === undefined ? this.required(key) : this.optional(key);
    const value = raw === undefined ? (fallback as number) : Number(raw);
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new Error(`${key} must be an integer from ${min} to ${max}`);
    }
    return value;
  }

  fourDigitYear(key: string): number {
    const year = Number(this.required(key));
    if (!Number.isInteger(year) || year < 1900 || year > 3000) {
      throw new Error(`${key} must be a four-digit integer`);
    }
    return year;
  }

  boolean(key: string, fallback: boolean): boolean {
    const value = this.optional(key);
    if (value === undefined) return fallback;
    if (value !== "true" && value !== "false") {
      throw new Error(`${key} must be "true" or "false"`);
    }
    return value === "true";
  }

  safePattern(key: string): RegExp {
    const pattern = this.required(key);
    if (
      pattern.length > 160 ||
      !pattern.startsWith("^") ||
      !pattern.endsWith("$") ||
      unsafeRegexSyntax.test(pattern)
    ) {
      throw new Error(`${key} must be a short, anchored, safe regex`);
    }
    try {
      return new RegExp(pattern);
    } catch {
      throw new Error(`${key} must be a valid regex`);
    }
  }

  duration(key: string): number {
    const match = /^(\d+)(s|m|h)$/.exec(this.required(key));
    const seconds = match
      ? Number(match[1]) * { s: 1, m: 60, h: 3600 }[match[2] as "s" | "m" | "h"]
      : 0;
    if (seconds < 60 || seconds > 3600) {
      throw new Error(
        `${key} must be a duration such as 15m, between 1 minute and 1 hour`,
      );
    }
    return seconds;
  }
}

// Appending an empty alternative makes the regex match "", exposing its group count.
const captureGroupCount = (pattern: RegExp): number =>
  (new RegExp(`${pattern.source}|`).exec("") as RegExpExecArray).length - 1;

/** Validates and types the environment. Any problem stops the app at boot with a clear message. */
export function parseEnvironment(env: Environment): AppConfigValues {
  const read = new EnvironmentReader(env);

  const nodeEnv = (read.optional("NODE_ENV") ??
    "development") as NodeEnvironment;
  if (!["development", "test", "production"].includes(nodeEnv)) {
    throw new Error("NODE_ENV must be development, test or production");
  }

  const databaseUrl = read.url("DATABASE_URL");
  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) {
    throw new Error(
      "DATABASE_URL must use the postgres or postgresql protocol",
    );
  }

  const frontendUrl = read.url("FRONTEND_URL");
  if (!["http:", "https:"].includes(frontendUrl.protocol)) {
    throw new Error("FRONTEND_URL must be an http or https origin");
  }

  const studentEmailPattern = read.safePattern("STUDENT_EMAIL_PATTERN");
  if (captureGroupCount(studentEmailPattern) < 1) {
    throw new Error(
      "STUDENT_EMAIL_PATTERN must capture the two-digit year in a group, e.g. (\\d{2})",
    );
  }
  const identity = {
    studentEmailPattern,
    staffEmailPattern: read.safePattern("STAFF_EMAIL_PATTERN"),
    batchBaseYear: read.fourDigitYear("BATCH_BASE_YEAR"),
    batchMinYear: read.fourDigitYear("BATCH_MIN_YEAR"),
  };

  const allowedHostedDomain = read
    .required("ALLOWED_HOSTED_DOMAIN")
    .toLowerCase();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(allowedHostedDomain)) {
    throw new Error(
      "ALLOWED_HOSTED_DOMAIN must be a domain such as example.edu",
    );
  }

  const jwtSecret = read.secret("JWT_ACCESS_SECRET");
  const cookieSecret = read.secret("COOKIE_SECRET");
  if (jwtSecret === cookieSecret) {
    throw new Error("JWT_ACCESS_SECRET and COOKIE_SECRET must be different");
  }

  const refreshTokenTtlDays = read.integer("REFRESH_TOKEN_TTL_DAYS", 1, 30);
  const refreshFamilyMaxDays = read.integer("REFRESH_FAMILY_MAX_DAYS", 1, 365);
  if (refreshFamilyMaxDays < refreshTokenTtlDays) {
    throw new Error(
      "REFRESH_FAMILY_MAX_DAYS must be at least REFRESH_TOKEN_TTL_DAYS",
    );
  }

  const devLoginEnabled = read.boolean("AUTH_DEV_LOGIN_ENABLED", false);
  if (devLoginEnabled && nodeEnv === "production") {
    throw new Error(
      "AUTH_DEV_LOGIN_ENABLED must be false when NODE_ENV is production",
    );
  }

  return {
    nodeEnv,
    port: read.integer("PORT", 1, 65535, 3000),
    databaseUrl: databaseUrl.toString(),
    frontendUrl: frontendUrl.origin,
    cookieSecret,
    google: {
      clientId: read.required("GOOGLE_CLIENT_ID"),
      clientSecret: read.required("GOOGLE_CLIENT_SECRET"),
      redirectUri: read.url("GOOGLE_REDIRECT_URI").toString(),
    },
    allowedHostedDomain,
    identity,
    adminBootstrapEmails: parseBootstrapAdmins(
      read.optional("ADMIN_BOOTSTRAP_EMAILS"),
      new RishihoodIdentityParser(identity),
    ),
    jwt: {
      accessSecret: jwtSecret,
      issuer: read.required("JWT_ISSUER"),
      audience: read.required("JWT_AUDIENCE"),
      accessTokenTtlSeconds: read.duration("ACCESS_TOKEN_TTL"),
    },
    sessions: { refreshTokenTtlDays, refreshFamilyMaxDays },
    devLoginEnabled,
    rateLimits: {
      loginPerMinute: read.integer(
        "AUTH_LOGIN_RATE_LIMIT_PER_MINUTE",
        1,
        10_000,
        10,
      ),
      refreshPerMinute: read.integer(
        "AUTH_REFRESH_RATE_LIMIT_PER_MINUTE",
        1,
        10_000,
        30,
      ),
    },
  };
}

// Bootstrap admins get the same check as an allowlist add: staff emails only, never students.
function parseBootstrapAdmins(
  raw: string | undefined,
  parser: RishihoodIdentityParser,
): ReadonlySet<string> {
  const emails = (raw ?? "").split(",").map(normalizeEmail).filter(Boolean);
  const resolver: RoleResolver = new RoleResolver();
  for (const email of emails) {
    try {
      resolver.assertCanBeElevated(parser.parse(email));
    } catch (error) {
      if (error instanceof AuthDomainError) {
        throw new Error(
          `ADMIN_BOOTSTRAP_EMAILS contains ${email}: ${error.code}`,
        );
      }
      throw error;
    }
  }
  return new Set(emails);
}

/** ConfigModule hook: fails the boot on invalid config, keeps the raw values for ConfigService. */
export function validateEnvironment(env: Environment): Environment {
  parseEnvironment(env);
  return env;
}
