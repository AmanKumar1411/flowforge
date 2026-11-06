import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { join } from "node:path";
import type { ESLint as ESLintClass } from "eslint";

const BACKEND = join(__dirname, "..");
const VIOLATION =
  'import { CurrentUser } from "../presentation/decorators/current-user.decorator";\nexport const used = CurrentUser;\n';
const RULE = "no-restricted-imports";

// Dynamic: ESLint's flat config is an ES module; only this test loads it.
async function rulesBrokenBy(file: string, code: string): Promise<string[]> {
  const { ESLint } = (await import("eslint")) as { ESLint: typeof ESLintClass };
  const [result] = await new ESLint({ cwd: BACKEND }).lintText(code, {
    filePath: join(BACKEND, file),
  });
  return result.messages.map((message) => message.ruleId ?? "");
}

// `npm run lint` applies this rule to every file; here it is proved to bite.
describe("The dependency rule", () => {
  for (const layer of ["application", "domain", "infrastructure"]) {
    it(`refuses an import of presentation from ${layer}/`, async () => {
      const broken = await rulesBrokenBy(
        `src/teams/${layer}/planted.ts`,
        VIOLATION,
      );

      assert.ok(broken.includes(RULE), `got: ${broken.join(", ")}`);
    });
  }

  it("allows presentation to import presentation", async () => {
    const broken = await rulesBrokenBy(
      "src/teams/presentation/planted.ts",
      VIOLATION,
    );

    assert.ok(!broken.includes(RULE), `got: ${broken.join(", ")}`);
  });

  it("holds for every file in src today", async () => {
    const { ESLint } = (await import("eslint")) as {
      ESLint: typeof ESLintClass;
    };
    const results = await new ESLint({ cwd: BACKEND }).lintFiles([
      "src/**/application/**/*.ts",
      "src/**/domain/**/*.ts",
      "src/**/infrastructure/**/*.ts",
    ]);

    const offenders = results.filter((result) =>
      result.messages.some((message) => message.ruleId === RULE),
    );
    assert.deepEqual(
      offenders.map((result) => result.filePath),
      [],
    );
  });
});
