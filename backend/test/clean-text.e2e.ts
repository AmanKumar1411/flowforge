import { after, before, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { getMetadataStorage } from "class-validator";
import { isInvalidText } from "../src/common/errors/database-errors";
import { IS_CLEAN_TEXT } from "../src/common/validation/clean-text";
import { DOMAIN, startTestApp, TestApp } from "./support/test-app";

const SRC = join(__dirname, "..", "src");

/** Every request DTO module: files in a `dto` folder or named `*.dto.ts`, tests aside. */
function dtoModules(dir = SRC): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return entry === "generated" ? [] : dtoModules(path);
    }
    const isDto =
      (dir.endsWith("/dto") || entry.endsWith(".dto.ts")) &&
      entry.endsWith(".ts") &&
      !entry.endsWith(".spec.ts");
    return isDto ? [path] : [];
  });
}

// H7: a NUL character in any text field reached PostgreSQL and came back as a 500 (BUG-2).
describe("Control characters in text", () => {
  let app: TestApp;

  before(async () => {
    app = await startTestApp();
    await app.reset();
  });
  after(() => app.close());

  it("every string field of every request DTO also refuses control characters", async () => {
    const storage = getMetadataStorage();
    const missing: string[] = [];
    let strings = 0;
    for (const file of dtoModules()) {
      const module = (await import(file)) as Record<string, unknown>;
      for (const exported of Object.values(module)) {
        if (typeof exported !== "function") continue;
        const rules = storage.getTargetValidationMetadatas(
          exported as new () => unknown,
          "",
          true,
          false,
        );
        for (const rule of rules.filter((r) => r.name === "isString")) {
          strings += 1;
          const covered = rules.some(
            (r) =>
              r.name === IS_CLEAN_TEXT &&
              r.propertyName === rule.propertyName &&
              Boolean(r.each) === Boolean(rule.each),
          );
          if (!covered) {
            missing.push(`${exported.name}.${rule.propertyName}`);
          }
        }
      }
    }
    assert.ok(strings >= 28, `${strings} string fields found`);
    assert.deepEqual(missing, []);
  });

  it("answers 400 for a NUL in a field, and allows tabs and new lines", async () => {
    const admin = await app.browser().signIn(`coordinator.x${DOMAIN}`);
    const tabbed = await admin.post("/admin/faculty-allowlist", {
      body: { email: `vatsala.s${DOMAIN}`, name: "Vatsala S\tDesign\nLab" },
    });
    assert.equal(tabbed.status, 201);
    const nul = await admin.post("/admin/faculty-allowlist", {
      body: { email: `anil.kr${DOMAIN}`, name: "Anil\u0000" },
    });
    assert.equal(nul.status, 400);
    assert.equal(nul.body.code, "VALIDATION_FAILED");
    assert.match(String(nul.body.message), /control characters/);

    const faculty = await app.browser().signIn(`vatsala.s${DOMAIN}`);
    const cycle = await faculty.post("/course-cycles", {
      body: { courseName: "Design\u0007", title: "T", batchYear: 2025 },
    });
    assert.equal(cycle.status, 400);
    assert.match(String(cycle.body.message), /control characters/);
  });

  it("maps PostgreSQL's invalid-text error (22021) to 400 INVALID_TEXT as a safety net", async () => {
    const error = await app.prisma.$queryRaw`SELECT ${"a\u0000b"}::text`.then(
      () => null,
      (caught: unknown) => caught,
    );
    assert.ok(error, "PostgreSQL refuses a NUL in text");
    assert.equal(isInvalidText(error), true);
  });
});
