/**
 * Lists every abstract class in backend/src and the classes that extend it, from the TypeScript AST.
 *
 *   cd backend && npm run docs:ports            writes docs/design/generated/ports.md
 *   cd backend && npm run docs:ports -- --check  also fails if the file is out of date, or if
 *                                               02-class-diagrams.md leaves out a port or an implementation
 *
 * The output has no date or commit in it, so unchanged code regenerates byte for byte. The commit it was
 * last checked at is recorded in 02-class-diagrams.md.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import type * as TS from "typescript";

const ROOT = resolve(__dirname, "..", "..", "..");
const SRC = join(ROOT, "backend", "src");
const OUTPUT = join(ROOT, "docs", "design", "generated", "ports.md");
const CLASS_DIAGRAMS = join(ROOT, "docs", "design", "02-class-diagrams.md");
// Resolved from backend/, which has TypeScript installed.
const ts = createRequire(join(ROOT, "backend", "package.json"))(
  "typescript",
) as typeof TS;

interface ClassInfo {
  name: string;
  file: string;
  isAbstract: boolean;
  parent: string | null;
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "generated" ? [] : sourceFiles(path);
    }
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

function classesIn(path: string): ClassInfo[] {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.ES2022,
    true,
  );
  const classes: ClassInfo[] = [];
  const visit = (node: TS.Node): void => {
    if (ts.isClassDeclaration(node) && node.name) {
      const heritage = node.heritageClauses?.find(
        (clause) => clause.token === ts.SyntaxKind.ExtendsKeyword,
      );
      const parent = heritage?.types[0]?.expression.getText(source) ?? null;
      const isAbstract =
        node.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.AbstractKeyword,
        ) ?? false;
      classes.push({
        name: node.name.text,
        file: relative(ROOT, path),
        isAbstract,
        parent,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return classes;
}

const isTestDouble = ({ file }: ClassInfo): boolean =>
  file.includes("/testing/") || file.endsWith(".spec.ts");

function render(classes: ClassInfo[]): string {
  const ports = classes
    .filter(({ isAbstract }) => isAbstract)
    .sort((a, b) => a.file.localeCompare(b.file));
  const lines = [
    "# Ports and their implementations",
    "",
    "Generated from the TypeScript AST of `backend/src` by `npm run docs:ports`. Do not edit by hand.",
    "",
    `${ports.length} abstract classes.`,
    "",
    "| Abstract class | Declared in | Production implementations | Test implementations |",
    "| --- | --- | --- | --- |",
  ];
  for (const port of ports) {
    const children = classes
      .filter(({ parent }) => parent === port.name)
      .sort((a, b) => a.name.localeCompare(b.name));
    const list = (items: ClassInfo[]) =>
      items.map(({ name }) => `\`${name}\``).join(", ") || "none";
    lines.push(
      `| \`${port.name}\` | \`${port.file}\` | ${list(children.filter((c) => !isTestDouble(c)))} | ${list(children.filter(isTestDouble))} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

function main(): void {
  const check = process.argv.includes("--check");
  const classes = sourceFiles(SRC).flatMap(classesIn);
  const output = render(classes);
  let failed = false;

  let current: string | null = null;
  try {
    current = readFileSync(OUTPUT, "utf8");
  } catch {
    current = null;
  }
  if (current === output) {
    console.log(`unchanged  ${relative(ROOT, OUTPUT)}`);
  } else if (check) {
    console.log(`OUT OF DATE  ${relative(ROOT, OUTPUT)}`);
    failed = true;
  } else {
    mkdirSync(dirname(OUTPUT), { recursive: true });
    writeFileSync(OUTPUT, output);
    console.log(`wrote  ${relative(ROOT, OUTPUT)}`);
  }

  if (check) {
    // A class named in the diagrams document: every port, and every production implementation of one.
    const document = readFileSync(CLASS_DIAGRAMS, "utf8");
    const ports = new Set(
      classes.filter(({ isAbstract }) => isAbstract).map(({ name }) => name),
    );
    const expected = classes.filter(
      ({ name, parent, isAbstract }) =>
        isAbstract ||
        (parent !== null && ports.has(parent) && name !== undefined),
    );
    const missing = expected
      .filter((item) => !isTestDouble(item))
      .filter(({ name }) => !new RegExp(`\\b${name}\\b`).test(document))
      .map(({ name }) => name);
    if (missing.length > 0) {
      console.log(
        `02-class-diagrams.md does not show: ${missing.join(", ")}`,
      );
      failed = true;
    } else {
      console.log(
        `02-class-diagrams.md shows all ${expected.filter((item) => !isTestDouble(item)).length} ports and production implementations`,
      );
    }
  }
  if (failed) process.exit(1);
}

main();
