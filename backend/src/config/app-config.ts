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
  "AUTH_REFRESH_RATE_LIMIT_PER_MINUTE",
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
