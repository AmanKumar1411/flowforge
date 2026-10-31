import { APIRequestContext, request } from "@playwright/test";
import { createHmac } from "node:crypto";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const config = require("./qa-config.cjs");
export const API: string = config.API;
export const WEB: string = config.WEB;
export const DOMAIN = "nst.rishihood.edu.in";

export interface CycleSummary {
  id: string;
  title: string;
  batchYear: number;
  owner: string;
  milestones: { id: string; position: number }[];
  teams: { id: string; name: string; leader: string; members: string[] }[];
}
export interface Manifest {
  admin: string;
  faculty: string[];
  pendingStaff: string;
  deactivated: string;
  students: Record<string, string[]>;
  cycles: Record<"capstone" | "systems" | "web" | "design" | "ml" | "lastTerm" | "draftCore" | "draftElective", CycleSummary>;
}
export const manifest = (): Manifest => config.manifest();

const cap = (word: string) => word[0].toUpperCase() + word.slice(1);
/** The display name the seed gave an email. */
export function nameOf(email: string): string {
  const local = email.split("@")[0];
  if (local.startsWith("fac.")) return `Prof ${cap(local.slice(4))}`;
  const [first, rest = ""] = local.split(".");
  return `${cap(first)} ${cap(rest.replace(/\d.*$/, "") || "qa")}`;
}

export interface Reply {
  status: number;
  body: any;
  text: string;
  headers: Record<string, string>;
}
export interface Session {
  email: string;
  userId: string;
  role: string;
  token: string;
  ctx: APIRequestContext;
  call(method: string, route: string, data?: unknown, headers?: Record<string, string>): Promise<Reply>;
  dispose(): Promise<void>;
}

export async function send(ctx: APIRequestContext, method: string, route: string, data?: unknown, headers: Record<string, string> = {}): Promise<Reply> {
  const response = await ctx.fetch(route.startsWith("http") ? route : `${API}${route}`, { method, data, headers, failOnStatusCode: false });
  const text = await response.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status(), body, text, headers: response.headers() };
}

/** Signs in through the real dev login (test-only) and the refresh endpoint, like the web app. */
export async function login(email: string, name = nameOf(email)): Promise<Session> {
  const ctx = await request.newContext({ extraHTTPHeaders: { Origin: WEB } });
  const signedIn = await send(ctx, "POST", "/auth/dev-login", { email, name });
  if (signedIn.status !== 204) throw new Error(`dev login for ${email}: ${signedIn.status} ${signedIn.text}`);
  const refreshed = await send(ctx, "POST", "/auth/refresh");
  if (refreshed.status !== 200) throw new Error(`refresh for ${email}: ${refreshed.status}`);
  const token: string = refreshed.body.accessToken;
  const me = await send(ctx, "GET", "/auth/me", undefined, { Authorization: `Bearer ${token}` });
  return {
    email,
    userId: me.body.id,
    role: me.body.role,
    token,
    ctx,
    call: (method, route, data, headers = {}) => send(ctx, method, route, data, { Authorization: `Bearer ${token}`, ...headers }),
    dispose: () => ctx.dispose(),
  };
}

const b64 = (value: object | string) => Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
/** An HS256 token signed with any secret, for tampering tests. */
export function signJwt(payload: object, secret: string, header: object = { alg: "HS256", typ: "JWT" }): string {
  const unsigned = `${b64(header)}.${b64(payload)}`;
  return `${unsigned}.${createHmac("sha256", secret).update(unsigned).digest("base64url")}`;
}
export const qaSecrets = (): Record<string, string> => config.readEnv();

/** Direct database access for setup and for checking what the API wrote. */
export async function sql<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Client, types } = require("pg");
  // timestamp without time zone (OID 1114) holds UTC here; read it as UTC.
  types.setTypeParser(1114, (value: string) => new Date(`${value.replace(" ", "T")}Z`));
  const client = new Client({ connectionString: config.databaseUrl() });
  await client.connect();
  try {
    // Prisma stores UTC in timestamp-without-zone columns; pg would send a Date in local time.
    return (await client.query(text, params.map((p) => (p instanceof Date ? p.toISOString() : p)))).rows;
  } finally {
    await client.end();
  }
}

export interface Plan {
  teamDeadline: Date;
  ideaDeadline: Date;
  milestones: { opens: Date; due: Date; evaluation?: Date; required?: string[]; optional?: string[] }[];
}
/** A create-cycle body for the API (used for setup only; the browser flows use the wizard). */
export function cycleBody(fields: Record<string, unknown>, plan: Plan): Record<string, unknown> {
  return {
    courseName: "QA course",
    title: `QA project ${Date.now()}`,
    batchYear: 2025,
    semester: 3,
    academicYear: "2026-27",
    minTeamSize: 1,
    maxTeamSize: 4,
    ...fields,
    teamDeadline: plan.teamDeadline.toISOString(),
    ideaDeadline: plan.ideaDeadline.toISOString(),
    milestones: plan.milestones.map((milestone, index) => ({
      name: `Milestone ${index + 1}`,
      submissionOpensAt: milestone.opens.toISOString(),
      submissionDueAt: milestone.due.toISOString(),
      evaluationAt: (milestone.evaluation ?? milestone.due).toISOString(),
      linkRequirement: { required: milestone.required ?? ["GITHUB"], optional: milestone.optional ?? ["DEMO", "REPORT"] },
    })),
  };
}
export const fromNow = (ms: number) => new Date(Date.now() + ms);
export const MINUTE = 60_000;
export const DAY = 24 * 60 * MINUTE;
