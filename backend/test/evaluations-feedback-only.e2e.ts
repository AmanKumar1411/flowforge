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
const MARK_KEYS = new Set(["marks", "maxMarks"]);

/** Every path (as a.b.c) in a JSON value whose key is a marks key. */
function marksKeysIn(value: unknown, path = "body"): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => marksKeysIn(item, `${path}[${i}]`));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => [
      ...(MARK_KEYS.has(key) ? [`${path}.${key}`] : []),
      ...marksKeysIn(child, `${path}.${key}`),
    ]);
  }
  return [];
}

// H3: this version gives feedback only (EVALUATION_MARKS_ENABLED=false, the default).
describe("Evaluations without marks (the default)", () => {
  const clock = new FixedClock(new Date());
  let app: TestApp;
  let owner: TestBrowser;
  let admin: TestBrowser;
  const s = {} as Record<"aman" | "neha" | "ravi", TestBrowser>;
  const ids = {} as Record<keyof typeof s, string>;
  let cycleId = "";
  let m1 = "";
  let falcon = "";
  let kestrel = "";
  /** Every response body seen, with the request that produced it. */
  const seen: { request: string; body: unknown }[] = [];

  const at = (offset: number) =>
    new Date(clock.now().getTime() + offset).toISOString();
  const base = () => `/course-cycles/${cycleId}/milestones/${m1}`;
  const call = async (
    who: TestBrowser,
    method: string,
    path: string,
    body?: object,
  ) => {
    const result = await who.request(method, path, { body });
    seen.push({ request: `${method} ${path}`, body: result.body });
    return result;
  };
  const save = (who: TestBrowser, teamId: string, body: object) =>
    call(who, "PUT", `${base()}/teams/${teamId}/evaluation`, body);

  before(async () => {
    app = await startTestApp({
      clock,
      env: { EVALUATION_MARKS_ENABLED: "false" },
    });
    await app.reset();
    admin = await app.browser().signIn(BOOTSTRAP_ADMIN);
    await admin.post("/admin/faculty-allowlist", {
      body: { email: `vatsala.s${DOMAIN}` },
    });
    owner = await app.browser().signIn(`vatsala.s${DOMAIN}`);
    for (const [key, email] of [
      ["aman", `aman.k26csai${DOMAIN}`],
      ["neha", `neha.t26csai${DOMAIN}`],
      ["ravi", `ravi.b26csai${DOMAIN}`],
    ] as const) {
      s[key] = await app.browser().signIn(email, key);
      ids[key] = String((await s[key].get("/auth/me")).body.id);
    }
    const created = await owner.post<{
      id: string;
      milestones: { id: string }[];
    }>("/course-cycles", {
      body: {
        courseName: "Software Design",
        title: "Feedback only",
        batchYear: 2026,
        semester: 7,
        academicYear: "2026-27",
        minTeamSize: 1,
        maxTeamSize: 3,
        teamDeadline: at(HOUR_MS),
        ideaDeadline: at(2 * HOUR_MS),
        milestones: [milestone("Design review", at(3 * HOUR_MS), at(DAY_MS))],
      },
    });
    cycleId = created.body.id;
    m1 = created.body.milestones[0].id;
    await owner.post(`/course-cycles/${cycleId}/publish`);
    const team = (who: TestBrowser, name: string, memberIds: string[]) =>
      who.post<{ id: string }>(`/course-cycles/${cycleId}/teams`, {
        body: { name, memberIds },
      });
    falcon = (await team(s.aman, "Falcon", [ids.neha])).body.id;
    kestrel = (await team(s.ravi, "Kestrel", [])).body.id;
    const idea = await s.aman.put<{ version: number }>(
      `/teams/${falcon}/idea`,
      { body: { title: "Lost and found", problem: "P", solution: "S" } },
    );
    await owner.post(`/teams/${falcon}/idea/review`, {
      body: { version: idea.body.version, decision: "APPROVED" },
    });
    clock.advance(3 * HOUR_MS);
    await s.neha.post(`/teams/${falcon}/milestones/${m1}/submissions`, {
      body: { links: [{ type: "GITHUB", url: "https://github.com/f/app" }] },
    });
    clock.advance(DAY_MS); // M1 is due: grading is open.
  });
  after(() => app.close());

  it("refuses a mark or a scale with 400 MARKS_DISABLED and requires feedback", async () => {
    const scale = await call(owner, "PUT", `${base()}/grading`, {
      maxMarks: 20,
    });
    assert.equal(scale.status, 400);
    assert.equal(scale.body.code, "MARKS_DISABLED");
    const marked = await save(owner, falcon, { marks: 14, feedback: "Good" });
    assert.equal(marked.status, 400);
    assert.equal(marked.body.code, "MARKS_DISABLED");
    const empty = await save(owner, falcon, { feedback: "   " });
    assert.equal(empty.status, 400);
    assert.equal(empty.body.code, "EMPTY_EVALUATION");
  });

  it("grades and releases with feedback alone, without any scale", async () => {
    const saved = await save(owner, falcon, { feedback: "Clear plan" });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.feedback, "Clear plan");
    const view = await call(owner, "GET", `${base()}/grading`);
    assert.equal(view.body.marksEnabled, false);
    const released = await call(owner, "POST", `${base()}/grading/release`);
    assert.equal(released.status, 200);
    const theirs = await call(
      s.neha,
      "GET",
      `${base()}/teams/${falcon}/evaluations`,
    );
    assert.equal(theirs.status, 200);
    assert.deepEqual(
      (theirs.body as unknown as { feedback: string }[]).map((e) => e.feedback),
      ["Clear plan"],
    );
  });

  it("never returns marks or the scale, to any role on any route, even ones stored before", async () => {
    // Marks saved while marks were on stay in the database (one setting turns them back on).
    await app.prisma.milestoneGrading.update({
      where: { milestoneId: m1 },
      data: { maxMarks: 20 },
    });
    await app.prisma.evaluation.update({
      where: { milestoneId_teamId: { milestoneId: m1, teamId: falcon } },
      data: { marks: 14 },
    });
    const ownersView = [
      `${base()}/grading`,
      `${base()}/teams/${falcon}/evaluations`,
      `${base()}/teams/${kestrel}/evaluations`,
      `${base()}/submissions`,
      `/course-cycles/${cycleId}`,
      `/course-cycles/${cycleId}/teams`,
      `/course-cycles/my`,
      `/teams/${falcon}`,
    ];
    for (const who of [owner, admin]) {
      for (const path of ownersView) await call(who, "GET", path);
    }
    for (const who of [s.aman, s.neha]) {
      for (const path of [
        "/me/dashboard",
        "/me/upcoming",
        "/teams/mine",
        `/teams/${falcon}`,
        `/teams/${falcon}/idea`,
        `/teams/${falcon}/milestones/${m1}/submissions`,
        `${base()}/teams/${falcon}/evaluations`,
        `/course-cycles/${cycleId}`,
      ]) {
        await call(who, "GET", path);
      }
    }
    for (const path of [
      "/me/dashboard",
      `${base()}/teams/${falcon}/evaluations`,
      `${base()}/grading`,
    ]) {
      await call(s.ravi, "GET", path);
    }
    const current = (await call(owner, "GET", `${base()}/grading`)).body as {
      rows: { team: { id: string }; evaluation: { version: number } | null }[];
    };
    const version = current.rows.find((row) => row.team.id === falcon)
      ?.evaluation?.version;
    const corrected = await save(owner, falcon, {
      feedback: "Clear plan; add the sensor data",
      expectedVersion: version,
    });
    assert.equal(corrected.status, 200);

    assert.ok(seen.length > 25, `${seen.length} responses checked`);
    const leaks = seen.flatMap(({ request, body }) =>
      marksKeysIn(body).map((path) => `${request}: ${path}`),
    );
    assert.deepEqual(leaks, []);
  });
});
