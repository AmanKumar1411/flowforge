/**
 * Turns the Prisma schema's DMMF into Mermaid `erDiagram`s.
 *
 *   cd backend && npm run docs:erd           writes the generated files
 *   cd backend && npm run docs:erd -- --check  exits 1 if any of them is out of date
 *
 * It writes docs/design/generated/erd.md in full, and replaces the marked region
 * (<!-- erd:start --> … <!-- erd:end -->) of the two documents that show the diagrams. The output
 * has no date or commit in it, so an unchanged schema regenerates byte for byte.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(__dirname, "..", "..", "..");
const BACKEND = join(ROOT, "backend");
// Resolved from backend/, where the dev dependency is installed.
const backendRequire = createRequire(join(BACKEND, "package.json"));
const { getDMMF } = backendRequire("@prisma/internals") as {
  getDMMF(options: { datamodel: string }): Promise<{ datamodel: Datamodel }>;
};

interface Field {
  name: string;
  kind: "scalar" | "object" | "enum" | "unsupported";
  type: string;
  isList: boolean;
  isRequired: boolean;
  isUnique: boolean;
  isId: boolean;
  nativeType?: [string, string[]] | null;
  relationName?: string;
  relationFromFields?: string[];
  relationOnDelete?: string;
}
interface Model {
  name: string;
  fields: Field[];
  primaryKey: { fields: string[] } | null;
}
interface EnumDef {
  name: string;
  values: { name: string }[];
}
interface IndexDef {
  model: string;
  type: "id" | "unique" | "normal" | "fulltext";
  fields: { name: string }[];
}
interface Datamodel {
  models: Model[];
  enums: EnumDef[];
  indexes: IndexDef[];
}

const AREAS: { title: string; note: string; models: string[] }[] = [
  {
    title: "Identity and access",
    note: "Who can sign in, with which role, and every session and audit row.",
    models: [
      "User",
      "FacultyAllowlistEntry",
      "FacultyAccessRequest",
      "RefreshToken",
      "AuditLog",
    ],
  },
  {
    title: "Cycles",
    note: "A project cycle, its milestones and its roster.",
    models: ["CourseProjectCycle", "Milestone", "CycleEnrollment"],
  },
  {
    title: "Teams",
    note: "The teams formed in a cycle, their members, and students looking for one.",
    models: ["Team", "TeamMember", "TeamSeeker"],
  },
  {
    title: "Ideas",
    note: "The faculty's catalog, each team's one current idea, and every review of it.",
    models: ["CatalogIdea", "ProjectIdea", "IdeaReview"],
  },
  {
    title: "Work and evaluations",
    note: "Versioned submissions per milestone, private evaluations and their history.",
    models: [
      "Submission",
      "MilestoneGrading",
      "Evaluation",
      "EvaluationRevision",
    ],
  },
  {
    title: "Operations",
    note: "Rate-limit counters shared by every API process. No foreign keys; the table is UNLOGGED.",
    models: ["RateLimitCounter"],
  },
];

const WHERE = "**Where in the code:** `backend/prisma/schema.prisma`";

interface Relation {
  parent: string;
  child: string;
  line: string;
}

function relationsOf(models: Model[]): Relation[] {
  const byName = new Map(models.map((model) => [model.name, model]));
  const relations: Relation[] = [];
  for (const child of models) {
    for (const field of child.fields) {
      if (field.kind !== "object" || !field.relationFromFields?.length) continue;
      const parent = byName.get(field.type)!;
      // The list or single field on the other side says how many children one parent has.
      const back = parent.fields.find(
        (other) =>
          other.relationName === field.relationName &&
          other.kind === "object" &&
          !(parent.name === child.name && other.name === field.name),
      );
      const parentEnd = field.isRequired ? "||" : "|o";
      const childEnd = back?.isList ? "o{" : "o|";
      const label = `${field.name}, ${field.relationOnDelete ?? "default"}`;
      relations.push({
        parent: parent.name,
        child: child.name,
        line: `  ${parent.name} ${parentEnd}--${childEnd} ${child.name} : "${label}"`,
      });
    }
  }
  return relations;
}

function attributeLine(model: Model, field: Field): string {
  const foreign = model.fields.some((other) =>
    other.relationFromFields?.includes(field.name),
  );
  const keys = [
    field.isId || model.primaryKey?.fields.includes(field.name) ? "PK" : null,
    foreign ? "FK" : null,
    field.isUnique ? "UK" : null,
  ].filter(Boolean);
  const native = field.nativeType
    ? `${field.nativeType[0]}_${field.nativeType[1].join("_")}`
    : field.type;
  const optional = field.isRequired ? "" : ' "nullable"';
  return `    ${native} ${field.name}${keys.length ? ` ${keys.join(",")}` : ""}${optional}`;
}

function detailDiagram(models: Model[], area: string[]): string {
  const inArea = new Set(area);
  const lines = ["```mermaid", "erDiagram"];
  for (const model of models.filter(({ name }) => inArea.has(name))) {
    lines.push(`  ${model.name} {`);
    for (const field of model.fields) {
      if (field.kind !== "object") lines.push(attributeLine(model, field));
    }
    lines.push("  }");
  }
  // A child in this area with its parent, which is shown as a bare box when it lives elsewhere.
  for (const relation of relationsOf(models)) {
    if (inArea.has(relation.child)) lines.push(relation.line);
  }
  lines.push("```");
  return lines.join("\n");
}

function overviewDiagram(models: Model[]): string {
  const lines = ["```mermaid", "erDiagram"];
  const shown = new Set(["User", "CourseProjectCycle"]);
  for (const relation of relationsOf(models)) {
    if (relation.parent === "User") continue;
    lines.push(relation.line);
    shown.add(relation.parent).add(relation.child);
  }
  lines.push(
    '  User ||--o{ CourseProjectCycle : "owns (one of many person links)"',
  );
  // Tables whose only foreign keys point at User, or that have none.
  for (const { name } of models) {
    if (!shown.has(name)) lines.push(`  ${name}`);
  }
  lines.push("```");
  return lines.join("\n");
}

function keysTable(datamodel: Datamodel): string {
  const rows = ["| Table | Kind | Columns |", "| --- | --- | --- |"];
  for (const index of datamodel.indexes) {
    const kind =
      index.type === "id"
        ? "primary key"
        : index.type === "unique"
          ? "unique"
          : "index";
    const columns = index.fields.map((field) => field.name).join(", ");
    rows.push(`| ${index.model} | ${kind} | ${columns} |`);
  }
  return rows.join("\n");
}

function enumsTable(datamodel: Datamodel): string {
  const rows = ["| Enum | Values |", "| --- | --- |"];
  for (const definition of datamodel.enums) {
    const values = definition.values.map((value) => value.name).join(", ");
    rows.push(`| ${definition.name} | ${values} |`);
  }
  return rows.join("\n");
}

function diagrams(datamodel: Datamodel, heading: string): string {
  const parts = [
    `${heading} All tables and how they connect`,
    "",
    "Every table and foreign key except those pointing at `User`, so the diagram stays readable. The area diagrams below show the `User` links. Each label is the relation's field name and its `onDelete` rule.",
    "",
    overviewDiagram(datamodel.models),
    "",
    WHERE,
  ];
  for (const area of AREAS) {
    parts.push(
      "",
      `${heading} ${area.title}`,
      "",
      `${area.note} A box without columns belongs to another area.`,
      "",
      detailDiagram(datamodel.models, area.models),
      "",
      WHERE,
    );
  }
  return parts.join("\n");
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const schema = readFileSync(join(BACKEND, "prisma", "schema.prisma"), "utf8");
  const { datamodel } = await getDMMF({ datamodel: schema });

  const placed = new Set(AREAS.flatMap((area) => area.models));
  const missing = datamodel.models.filter(({ name }) => !placed.has(name));
  if (missing.length > 0) {
    throw new Error(
      `Add these tables to an area in generate-erd.ts: ${missing.map((m) => m.name).join(", ")}`,
    );
  }

  const full = [
    "# Entity-relationship diagrams",
    "",
    "Generated from `backend/prisma/schema.prisma` by `npm run docs:erd`. Do not edit by hand.",
    "",
    `${datamodel.models.length} tables, ${datamodel.enums.length} enums, ${datamodel.indexes.length} primary keys, unique keys and indexes declared in the schema.`,
    "",
    diagrams(datamodel, "##"),
    "",
    "## Keys and indexes declared in the schema",
    "",
    "CHECK constraints and triggers are written by hand in the migrations; see [08-database.md](../08-database.md).",
    "",
    keysTable(datamodel),
    "",
    "## Enums",
    "",
    enumsTable(datamodel),
    "",
  ].join("\n");

  const outputs = new Map<string, string>();
  outputs.set(join(ROOT, "docs/design/generated/erd.md"), full);
  const region = (heading: string) =>
    `<!-- erd:start (generated by npm run docs:erd) -->\n${diagrams(datamodel, heading)}\n<!-- erd:end -->`;
  for (const [file, heading] of [
    ["docs/design/08-database.md", "###"],
    ["docs/study/database-guide.md", "###"],
  ] as const) {
    const path = join(ROOT, file);
    // docs/study/ is git-ignored, so a fresh clone does not have the guide.
    if (!existsSync(path)) continue;
    const current = readFileSync(path, "utf8");
    const marked = /<!-- erd:start[^\n]*-->[\s\S]*?<!-- erd:end -->/;
    if (!marked.test(current)) {
      throw new Error(`${file} has no <!-- erd:start --> region`);
    }
    outputs.set(path, current.replace(marked, () => region(heading)));
  }

  let stale = 0;
  for (const [path, content] of outputs) {
    const shown = relative(ROOT, path);
    let current: string | null = null;
    try {
      current = readFileSync(path, "utf8");
    } catch {
      current = null;
    }
    if (current === content) {
      console.log(`unchanged  ${shown}`);
    } else if (check) {
      console.log(`OUT OF DATE  ${shown}`);
      stale += 1;
    } else {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
      console.log(`wrote  ${shown}`);
    }
  }
  if (stale > 0) process.exit(1);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
