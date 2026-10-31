import { after, before, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { Logger } from "@nestjs/common";
import { nestsDeeperThan } from "../src/common/http/body-depth.middleware";
import { FRONTEND_ORIGIN, startTestApp, TestApp } from "./support/test-app";

/** `{"a":{"a":…}}` nested `depth` times, as raw JSON (JSON.stringify itself would recurse). */
const nested = (depth: number) =>
  `${'{"a":'.repeat(depth - 1)}{}${"}".repeat(depth - 1)}`;

// H8: deeply nested JSON overflowed the validation pipe's recursion: 500 and a stack trace (BUG-3).
describe("Deeply nested request bodies", () => {
  let app: TestApp;
  const logged: { level: string; text: string }[] = [];
  const originals = {
    warn: Logger.prototype.warn,
    error: Logger.prototype.error,
  };

  before(async () => {
    Logger.prototype.warn = function (message: unknown) {
      logged.push({ level: "warn", text: String(message) });
    };
    Logger.prototype.error = function (message: unknown) {
      logged.push({ level: "error", text: String(message) });
    };
    app = await startTestApp();
  });
  after(async () => {
    Logger.prototype.warn = originals.warn;
    Logger.prototype.error = originals.error;
    await app.close();
  });

  const post = (body: string) =>
    fetch(`${app.apiUrl}/auth/dev-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: FRONTEND_ORIGIN },
      body,
    });

  it("measures depth without recursion, even 100,000 levels deep", () => {
    let deep: unknown = {};
    for (let level = 1; level < 100_000; level += 1) deep = { a: deep };
    assert.equal(nestsDeeperThan(deep, 32), true);
    assert.equal(nestsDeeperThan({ a: [{ b: 1 }] }, 32), false);
  });

  it("refuses a body nested 5,000 levels with 400 BODY_TOO_DEEP, logging one line and no stack trace", async () => {
    const response = await post(nested(5_000));
    assert.equal(response.status, 400);
    const body = (await response.json()) as { code: string };
    assert.equal(body.code, "BODY_TOO_DEEP");
    assert.equal(logged.filter((entry) => entry.level === "error").length, 0);
    const warnings = logged.filter((entry) => entry.level === "warn");
    assert.equal(warnings.length, 1);
    assert.doesNotMatch(warnings[0].text, /\n|\bat /);
  });

  it("lets a body of 32 levels reach validation as usual", async () => {
    const response = await post(nested(32));
    assert.equal(response.status, 400);
    const body = (await response.json()) as { code: string };
    assert.equal(body.code, "VALIDATION_FAILED");
  });
});
