type Environment = Record<string, unknown>;

const required = (config: Environment, key: string): string => {
  const value = config[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value.trim();
};

export function validateEnvironment(config: Environment): Environment {
  const databaseUrl = required(config, "DATABASE_URL");
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }

  if (!["postgres:", "postgresql:"].includes(parsedUrl.protocol)) {
    throw new Error(
      "DATABASE_URL must use the postgres or postgresql protocol",
    );
  }

  const jwtSecret = required(config, "JWT_SECRET");
  if (jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters long");
  }

  const domains = required(config, "ALLOWED_UNIVERSITY_EMAIL_DOMAINS")
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
  if (
    domains.length === 0 ||
    domains.some((domain) => !/^[a-z0-9.-]+$/.test(domain))
  ) {
    throw new Error(
      "ALLOWED_UNIVERSITY_EMAIL_DOMAINS must contain valid exact domains",
    );
  }

  const batchPattern = required(config, "BATCH_EMAIL_PATTERN");
  if (
    batchPattern.length > 128 ||
    !batchPattern.startsWith("^") ||
    !batchPattern.endsWith("$") ||
    !batchPattern.includes("?<batch>") ||
    /\\[1-9]|\(\?(?!<batch>)[:=!<]|\([^)]*[+*][^)]*\)[+*{]/.test(batchPattern)
  ) {
    throw new Error(
      "BATCH_EMAIL_PATTERN must be a short, anchored, safe regex with a batch group",
    );
  }
  try {
    new RegExp(batchPattern);
  } catch {
    throw new Error("BATCH_EMAIL_PATTERN must be a valid regex");
  }

  const batchBaseYear = Number(required(config, "BATCH_BASE_YEAR"));
  if (
    !Number.isInteger(batchBaseYear) ||
    batchBaseYear < 1900 ||
    batchBaseYear > 3000
  ) {
    throw new Error("BATCH_BASE_YEAR must be a four-digit integer");
  }

  const corsOrigins = required(config, "CORS_ORIGIN")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (corsOrigins.length === 0 || corsOrigins.includes("*")) {
    throw new Error("CORS_ORIGIN must contain one or more explicit origins");
  }

  const port = Number(config["PORT"] ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be a valid TCP port");
  }

  return {
    ...config,
    DATABASE_URL: databaseUrl,
    JWT_SECRET: jwtSecret,
    ALLOWED_UNIVERSITY_EMAIL_DOMAINS: domains.join(","),
    BATCH_EMAIL_PATTERN: batchPattern,
    BATCH_BASE_YEAR: String(batchBaseYear),
    CORS_ORIGIN: corsOrigins.join(","),
    PORT: String(port),
  };
}
