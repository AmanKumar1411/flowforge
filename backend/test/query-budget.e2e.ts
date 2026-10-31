import { after, before, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { FixedClock } from "../src/common/testing/fixed-clock";
import {
  BOOTSTRAP_ADMIN,
  DOMAIN,
  startTestApp,
  TestApp,
} from "./support/test-app";
import { milestone } from "./support/schedule";
import { TestBrowser } from "./support/test-browser";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * The most a request may cost in SQL statements (H4; a transaction counts its
 * COMMIT). Each is what the endpoint needs with the per-request memo; a new
 * query here is a deliberate choice, not an accident. In comments: the count
 * before Phase 10 (with the refresh limit of H2 already counted).
 */
const BUDGETS = {
  "GET /course-cycles/:id (member)": 3, // 3
  "GET /teams/:id (member)": 6, // 6
  "GET /teams/:id/idea (member)": 10, // 12
  "GET /teams/:id/milestones/:m/submissions (member)": 8, // 16
  "GET evaluations (member, released)": 9, // 11
  "GET /me/dashboard (member)": 21, // 21
  // 12 statements of work, plus the two write-limit counters of H10 (per milestone, per user).
  "POST submission (member)": 14, // 21
  "GET grading (owner)": 9, // 23
  "GET /course-cycles/:id/milestones/:m/submissions (owner)": 11, // 16
  "POST /auth/refresh": 7, // 8
} as const;

describe("Queries per request (H4)", () => {
  const clock = new FixedClock(new Date());
  let app: TestApp;
  let owner: TestBrowser;
  const members: TestBrowser[] = [];
  let cycleId = "";
  let m1 = "";
  let m2 = "";
  const teamIds: string[] = [];
  let recording: string[] | null = null;

  const at = (offset: number) =>
    new Date(clock.now().getTime() + offset).toISOString();

  /** Runs one request and returns the SQL it sent. */
  async function queriesOf(work: () => Promise<{ status: number }>) {
    recording = [];
    const result = await work();
    const sent = recording;
    recording = null;
    assert.ok(result.status < 400, `status ${result.status}`);
    return sent;
  }

  before(async () => {
    app = await startTestApp({ clock });
    await app.reset();
    (
      app.prisma as unknown as {
        $on: (event: "query", cb: (e: { query: string }) => void) => void;
      }
    ).$on("query", (event) => recording?.push(event.query));
    const admin = await app.browser().signIn(BOOTSTRAP_ADMIN);
    await admin.post("/admin/faculty-allowlist", {
      body: { email: `vatsala.s${DOMAIN}` },
    });
    owner = await app.browser().signIn(`vatsala.s${DOMAIN}`);
    const names = ["aman", "neha", "ravi", "kiran", "meera", "omar"];
    for (const name of names) {
      members.push(await app.browser().signIn(`${name}.q26csai${DOMAIN}`));
    }
    const ids = await Promise.all(
      members.map(async (m) => String((await m.get("/auth/me")).body.id)),
    );
    const created = await owner.post<{
      id: string;
      milestones: { id: string }[];
    }>("/course-cycles", {
      body: {
        courseName: "Software Design",
        title: "Budget",
        batchYear: 2026,
        semester: 7,
        academicYear: "2026-27",
        minTeamSize: 1,
        maxTeamSize: 3,
        teamDeadline: at(HOUR_MS),
        ideaDeadline: at(2 * HOUR_MS),
        milestones: [
          milestone("Design review", at(3 * HOUR_MS), at(DAY_MS)),
          milestone("Final", at(DAY_MS), at(10 * DAY_MS)),
        ],
      },
    });
    cycleId = created.body.id;
    [m1, m2] = created.body.milestones.map((m) => m.id);
    await owner.post(`/course-cycles/${cycleId}/publish`);
    // Three teams of two, each with an approved idea and three versions of M1.
    for (let t = 0; t < 3; t += 1) {
      const leader = members[2 * t];
      const team = await leader.post<{ id: string }>(
        `/course-cycles/${cycleId}/teams`,
        { body: { name: `Team ${t}`, memberIds: [ids[2 * t + 1]] } },
      );
      teamIds.push(team.body.id);
      const idea = await leader.put<{ version: number }>(
        `/teams/${team.body.id}/idea`,
        { body: { title: `Idea ${t}`, problem: "P", solution: "S" } },
      );
      await owner.post(`/teams/${team.body.id}/idea/review`, {
        body: { version: idea.body.version, decision: "APPROVED" },
      });
    }
    clock.advance(3 * HOUR_MS);
    for (const [t, teamId] of teamIds.entries()) {
      for (let v = 0; v < 3; v += 1) {
        await members[2 * t + (v % 2)].post(
          `/teams/${teamId}/milestones/${m1}/submissions`,
          {
            body: {
              links: [
                { type: "GITHUB", url: `https://github.com/t${t}/v${v}` },
              ],
            },
          },
        );
      }
    }
    clock.advance(DAY_MS); // M1 due: grade and release; M2 open.
    for (const teamId of teamIds) {
      await owner.put(
        `/course-cycles/${cycleId}/milestones/${m1}/teams/${teamId}/evaluation`,
        { body: { feedback: "Good" } },
      );
    }
    await owner.post(
      `/course-cycles/${cycleId}/milestones/${m1}/grading/release`,
    );
  });
  after(() => app.close());

  it("stays within each endpoint's query budget", async () => {
    const [aman, neha] = members;
    const team = teamIds[0];
    // The sessions above are older than their one-day lifetime on this clock.
    const fresh = await app.browser().signIn(`meera.q26csai${DOMAIN}`);
    const measured: Record<string, string[]> = {
      "GET /course-cycles/:id (member)": await queriesOf(() =>
        aman.get(`/course-cycles/${cycleId}`),
      ),
      "GET /teams/:id (member)": await queriesOf(() =>
        aman.get(`/teams/${team}`),
      ),
      "GET /teams/:id/idea (member)": await queriesOf(() =>
        aman.get(`/teams/${team}/idea`),
      ),
      "GET /teams/:id/milestones/:m/submissions (member)": await queriesOf(() =>
        aman.get(`/teams/${team}/milestones/${m1}/submissions`),
      ),
      "GET evaluations (member, released)": await queriesOf(() =>
        aman.get(
          `/course-cycles/${cycleId}/milestones/${m1}/teams/${team}/evaluations`,
        ),
      ),
      "GET /me/dashboard (member)": await queriesOf(() =>
        aman.get("/me/dashboard"),
      ),
      "POST submission (member)": await queriesOf(() =>
        neha.post(`/teams/${team}/milestones/${m2}/submissions`, {
          body: {
            links: [{ type: "GITHUB", url: "https://github.com/t0/m2" }],
          },
        }),
      ),
      "GET grading (owner)": await queriesOf(() =>
        owner.get(`/course-cycles/${cycleId}/milestones/${m1}/grading`),
      ),
      "GET /course-cycles/:id/milestones/:m/submissions (owner)":
        await queriesOf(() =>
          owner.get(`/course-cycles/${cycleId}/milestones/${m1}/submissions`),
        ),
      "POST /auth/refresh": await queriesOf(() => fresh.refresh()),
    };
    const report = Object.entries(measured).map(
      ([name, queries]) =>
        `${String(queries.length).padStart(3)} (budget ${BUDGETS[name as keyof typeof BUDGETS]})  ${name}` +
        (process.env.PRINT_QUERIES
          ? `\n${queries.map((q) => `        ${q.replace(/\s+/g, " ")}`).join("\n")}`
          : ""),
    );
    if (process.env.PRINT_QUERIES) console.log(report.join("\n"));
    const over = Object.entries(measured).filter(
      ([name, queries]) =>
        queries.length > BUDGETS[name as keyof typeof BUDGETS],
    );
    assert.deepEqual(
      over.map(([name]) => name),
      [],
      report.join("\n"),
    );
  });
});
