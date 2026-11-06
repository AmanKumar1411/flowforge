/**
 * Checks that docs/design/ only cites things that exist.
 *
 *   cd backend && npm run docs:check
 *
 * - every Markdown link resolves, anchors included
 * - every path in backticks exists
 * - every code excerpt (```ts and ```js) is copied exactly from a file
 * - every class name, method and error code in backticks appears in the code
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(__dirname, "..", "..", "..");
const DESIGN = join(ROOT, "docs", "design");
const SOURCE_ROOTS = [
  "backend/src",
  "backend/test",
  "backend/prisma",
  "frontend/src",
  "frontend/worker",
  "tests",
  "e2e/browser",
];
const SOURCE_FILE = /\.(ts|tsx|cjs|mjs|js|prisma|sql|sh)$/;
const SKIP_FOLDER = new Set(["generated", "node_modules", "results", "dist"]);

function walk(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return SKIP_FOLDER.has(entry.name) ? [] : walk(path);
    }
    return [path];
  });
}

const sources = [
  ...SOURCE_ROOTS.flatMap((folder) => walk(join(ROOT, folder))),
  join(ROOT, "backend/eslint.config.mjs"),
  join(ROOT, "backend/tsconfig.json"),
].filter((path) => SOURCE_FILE.test(path) || path.endsWith("tsconfig.json"));
const contents = new Map(sources.map((path) => [path, readFileSync(path, "utf8")]));
const everything = [...contents.values()].join("\n");
const fileNames = new Set(sources.map((path) => path.split("/").pop()));

/** GitHub's heading anchors. */
const slug = (heading: string): string =>
  heading
    .trim()
    .replace(/`/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");

function anchorsOf(path: string): Set<string> {
  const anchors = new Set<string>();
  const seen = new Map<string, number>();
  let fenced = false;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.startsWith("```")) fenced = !fenced;
    const heading = !fenced && /^#{1,6}\s+(.*)$/.exec(line);
    if (!heading) continue;
    const base = slug(heading[1]);
    const count = seen.get(base) ?? 0;
    anchors.add(count === 0 ? base : `${base}-${count}`);
    seen.set(base, count + 1);
  }
  return anchors;
}

const PATH_ROOTS = /^(backend|frontend|docs|tests|e2e|infra)\//;
const documents = walk(DESIGN).filter((path) => path.endsWith(".md"));
const problems: string[] = [];
const counts = { links: 0, paths: 0, excerpts: 0, names: 0 };

for (const document of documents) {
  const shown = relative(ROOT, document);
  const text = readFileSync(document, "utf8");
  const generated = document.includes("/generated/");

  // Excerpts, then everything outside fenced blocks.
  for (const match of text.matchAll(/```(ts|js)\n([\s\S]*?)```/g)) {
    counts.excerpts += 1;
    if (generated) continue;
    const excerpt = match[2].replace(/\n$/, "");
    if (!everything.includes(excerpt)) {
      problems.push(
        `${shown}: excerpt is not in any file: ${excerpt.split("\n")[0].trim()}`,
      );
    }
    if (excerpt.split("\n").length > 10) {
      problems.push(
        `${shown}: excerpt is longer than 10 lines: ${excerpt.split("\n")[0].trim()}`,
      );
    }
  }
  const prose = text.replace(/```[\s\S]*?```/g, "");

  for (const match of prose.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = match[1];
    if (/^(https?:|mailto:)/.test(target)) continue;
    counts.links += 1;
    const [file, anchor] = target.split("#");
    const path = file ? resolve(dirname(document), file) : document;
    if (!existsSync(path)) {
      problems.push(`${shown}: broken link ${target}`);
    } else if (
      anchor &&
      path.endsWith(".md") &&
      !anchorsOf(path).has(anchor)
    ) {
      problems.push(`${shown}: no heading for ${target}`);
    }
  }

  for (const match of prose.matchAll(/`([^`\n]+)`/g)) {
    const code = match[1].trim();
    if (PATH_ROOTS.test(code) && !/[\s*<>]/.test(code)) {
      counts.paths += 1;
      if (!existsSync(join(ROOT, code.replace(/\/$/, "")))) {
        problems.push(`${shown}: no such path ${code}`);
      }
    } else if (/^[\w.-]+\.(e2e|spec|test)\.tsx?$/.test(code)) {
      counts.paths += 1;
      if (!fileNames.has(code)) problems.push(`${shown}: no such test ${code}`);
    } else if (/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(code)) {
      counts.names += 1;
      if (!everything.includes(code)) {
        problems.push(`${shown}: no such code or constant ${code}`);
      }
    } else if (/^[A-Z][a-zA-Z]+[a-z](\.[a-zA-Z]+)?$/.test(code)) {
      counts.names += 1;
      for (const part of code.split(".")) {
        if (!everything.includes(part)) {
          problems.push(`${shown}: no such name ${code}`);
        }
      }
    }
  }
}

console.log(
  `${documents.length} documents: ${counts.links} links, ${counts.paths} paths, ${counts.excerpts} excerpts, ${counts.names} names checked`,
);
if (problems.length > 0) {
  for (const problem of problems) console.log(problem);
  console.log(`${problems.length} problems`);
  process.exit(1);
}
console.log("no problems");
