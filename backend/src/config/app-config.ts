import type { ConfigService } from "@nestjs/config";
import { AppConfigValues, parseEnvironment } from "./env.validation";

export const ENVIRONMENT_KEYS = [
  "NODE_ENV",
  "PORT",
  "DATABASE_URL",
  "FRONTEND_URL",
  "COOKIE_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "ALLOWED_HOSTED_DOMAIN",
  "STUDENT_EMAIL_PATTERN",
  "STAFF_EMAIL_PATTERN",
  "BATCH_BASE_YEAR",
  "BATCH_MIN_YEAR",
  "ADMIN_BOOTSTRAP_EMAILS",
  "JWT_ACCESS_SECRET",
  "JWT_ISSUER",
  "JWT_AUDIENCE",
  "ACCESS_TOKEN_TTL",
  "REFRESH_TOKEN_TTL_DAYS",
  "REFRESH_FAMILY_MAX_DAYS",
  "AUTH_DEV_LOGIN_ENABLED",
  "AUTH_LOGIN_RATE_LIMIT_PER_MINUTE",
  "AUTH_ACCOUNT_LOGIN_RATE_LIMIT_PER_MINUTE",
  "AUTH_REFRESH_RATE_LIMIT_PER_MINUTE",
  "TRUST_PROXY",
  "EVALUATION_MARKS_ENABLED",
  "API_WORKERS",
  "DB_POOL_MAX",
  "DB_MAX_CONNECTIONS",
  "DB_CONNECTION_HEADROOM",
  "HTTP_KEEP_ALIVE_TIMEOUT_MS",
  "DB_QUERY_EVENTS",
  "MAX_BODY_DEPTH",
  "SUBMISSION_RATE_LIMIT_PER_MINUTE",
  "WRITE_RATE_LIMIT_PER_MINUTE",
  "SUBMISSION_VERSION_LIMIT",
  "REFRESH_REUSE_GRACE_SECONDS",
] as const;

/** Typed, validated configuration. Inject this instead of reading ConfigService keys. */
export class AppConfig {
  constructor(readonly values: AppConfigValues) {}

  get isProduction(): boolean {
    return this.values.nodeEnv === "production";
  }

  static fromConfigService(config: ConfigService): AppConfig {
    const env = Object.fromEntries(
      ENVIRONMENT_KEYS.map((key) => [key, config.get<string>(key)]),
    );
    return new AppConfig(parseEnvironment(env));
  }
}
