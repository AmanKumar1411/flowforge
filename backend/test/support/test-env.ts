// Imported first by every integration test: it must set process.env before AppModule loads.
import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "dotenv";
import { testEnvironment } from "../../src/config/testing/test-environment";

const TEST_DATABASE = "flowforge_test";

/** TEST_DATABASE_URL if set, otherwise backend/.env's DATABASE_URL pointed at flowforge_test. */
function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) {
    return process.env.TEST_DATABASE_URL;
  }
  const envFile = join(__dirname, "..", "..", ".env");
  assert(
    existsSync(envFile),
    "Set TEST_DATABASE_URL or create backend/.env with DATABASE_URL",
  );
  const url = new URL(parse(readFileSync(envFile)).DATABASE_URL);
  url.pathname = `/${TEST_DATABASE}`;
  return url.toString();
}

export const TEST_DATABASE_URL = testDatabaseUrl();
assert.equal(
  new URL(TEST_DATABASE_URL).pathname,
  `/${TEST_DATABASE}`,
  "Integration tests only ever run against the flowforge_test database",
);

Object.assign(process.env, testEnvironment(), {
  DATABASE_URL: TEST_DATABASE_URL,
});
