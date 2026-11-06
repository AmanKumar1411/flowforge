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

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

// The edge cases in docs/design/09-errors-edge-cases.md that had no test at the API level.
describe("Edges of every window, one minute either side and exactly on it", () => {
  const clock = new FixedClock(new Date());
  const start = clock.now().getTime();
  const at = (offset: number) => new Date(start + offset).toISOString();
  const TEAM_DEADLINE = DAY_MS;
  const IDEA_DEADLINE = 2 * DAY_MS;
  const OPENS = 3 * DAY_MS;
  const DUE = 4 * DAY_MS;

  let app: TestApp;
  let owner: TestBrowser;
  let leader: TestBrowser;
  let cycleId = "";
  let m1 = "";
  let teamId = "";

  /** Moves the clock to this offset from the start, whichever way that is. */
  const goTo = (offset: number) =>
    clock.advance(start + offset - clock.now().getTime());
  const work = () =>
    leader.post(`/teams/${teamId}/milestones/${m1}/submissions`, {
      body: { links: [{ type: "GITHUB", url: "https://github.com/f/r" }] },
    });
  const rename = (name: string) =>
    leader.patch(`/teams/${teamId}`, { body: { name } });
  const proposal = (title: string) => ({
    body: { title, problem: "A problem", solution: "A solution", links: [] },
  });

  before(async () => {
    app = await startTestApp({ clock });
    await app.reset();
    const admin = await app.browser().signIn(BOOTSTRAP_ADMIN);
    await admin.post("/admin/faculty-allowlist", {
      body: { email: `vatsala.s${DOMAIN}` },
    });
    owner = await app.browser().signIn(`vatsala.s${DOMAIN}`);
    leader = await app.browser().signIn(`aman.k26csai${DOMAIN}`);
    const created = await owner.post<{
      id: string;
      milestones: { id: string }[];
    }>("/course-cycles", {
      body: {
        courseName: "Software Design",
        title: "Edges",
        batchYear: 2026,
        semester: 7,
        academicYear: "2026-27",
        teamDeadline: at(TEAM_DEADLINE),
        ideaDeadline: at(IDEA_DEADLINE),
        milestones: [milestone("M1", at(OPENS), at(DUE))],
      },
    });
    cycleId = created.body.id;
    m1 = created.body.milestones[0].id;
    await owner.post(`/course-cycles/${cycleId}/publish`);
    const team = await leader.post<{ id: string }>(
      `/course-cycles/${cycleId}/teams`,
      { body: { name: "Falcon", memberIds: [] } },
    );
    teamId = team.body.id;
  });
  after(() => app.close());

  it("the team deadline: open a minute before; closed exactly on it and a minute after", async () => {
    goTo(TEAM_DEADLINE - MINUTE_MS);
    assert.equal((await rename("Before")).status, 200);

    goTo(TEAM_DEADLINE);
    const exactly = await rename("Exactly");
    assert.equal(exactly.status, 409);
    assert.equal(exactly.body.code, "TEAM_FORMATION_CLOSED");

    goTo(TEAM_DEADLINE + MINUTE_MS);
    const after = await rename("After");
    assert.equal(after.status, 409);
    assert.equal(after.body.code, "TEAM_FORMATION_CLOSED");
  });

  it("the idea deadline: open a minute before; closed exactly on it and a minute after", async () => {
    const put = (title: string) =>
      leader.put(`/teams/${teamId}/idea`, proposal(title));

    goTo(IDEA_DEADLINE);
    const exactly = await put("Exactly");
    assert.equal(exactly.status, 409);
    assert.equal(exactly.body.code, "IDEA_SUBMISSION_CLOSED");

    goTo(IDEA_DEADLINE + MINUTE_MS);
    const after = await put("After");
    assert.equal(after.body.code, "IDEA_SUBMISSION_CLOSED");

    goTo(IDEA_DEADLINE - MINUTE_MS);
    assert.equal((await put("Before")).status, 200);
    const idea = await leader.get<{ idea: { version: number } }>(
      `/teams/${teamId}/idea`,
    );
    const decided = await owner.post(`/teams/${teamId}/idea/review`, {
      body: { version: idea.body.idea.version, decision: "APPROVED" },
    });
    assert.equal(decided.status, 200);
  });

  it("a milestone opening: closed a minute before; open exactly on it", async () => {
    goTo(OPENS - MINUTE_MS);
    const early = await work();
    assert.equal(early.status, 409);
    assert.equal(early.body.code, "SUBMISSION_NOT_OPEN");

    goTo(OPENS);
    assert.equal((await work()).status, 201);
  });

  it("a milestone's due time: open a minute before; closed exactly on it and a minute after, with nothing saved", async () => {
    goTo(DUE - MINUTE_MS);
    assert.equal((await work()).status, 201);

    goTo(DUE);
    const exactly = await work();
    assert.equal(exactly.status, 409);
    assert.equal(exactly.body.code, "SUBMISSION_CLOSED");

    goTo(DUE + MINUTE_MS);
    const after = await work();
    assert.equal(after.body.code, "SUBMISSION_CLOSED");

    const versions = await leader.get<{ version: number }[]>(
      `/teams/${teamId}/milestones/${m1}/submissions`,
    );
    assert.deepEqual(
      versions.body.map(({ version }) => version),
      [2, 1],
    );
  });

  it("grading: closed a minute before the due time; open exactly on it", async () => {
    const save = (feedback: string, expectedVersion?: number) =>
      owner.put<{ code?: string }>(
        `/course-cycles/${cycleId}/milestones/${m1}/teams/${teamId}/evaluation`,
        { body: { feedback, expectedVersion } },
      );

    goTo(DUE - MINUTE_MS);
    const early = await save("Too early");
    assert.equal(early.status, 409);
    assert.equal(early.body.code, "GRADING_NOT_OPEN");

    goTo(DUE);
    assert.equal((await save("Good work")).status, 200);
  });
});

describe("A release racing saves", () => {
  const clock = new FixedClock(new Date());
  const start = clock.now().getTime();
  const at = (offset: number) => new Date(start + offset).toISOString();

  let app: TestApp;
  let owner: TestBrowser;
  let student: TestBrowser;
  let cycleId = "";
  let m1 = "";
  let teamId = "";

  before(async () => {
    app = await startTestApp({ clock });
    await app.reset();
    const admin = await app.browser().signIn(BOOTSTRAP_ADMIN);
    await admin.post("/admin/faculty-allowlist", {
      body: { email: `vatsala.s${DOMAIN}` },
    });
    owner = await app.browser().signIn(`vatsala.s${DOMAIN}`);
    student = await app.browser().signIn(`aman.k26csai${DOMAIN}`);
    const created = await owner.post<{
      id: string;
      milestones: { id: string }[];
    }>("/course-cycles", {
      body: {
        courseName: "Software Design",
        title: "Race",
        batchYear: 2026,
        semester: 7,
        academicYear: "2026-27",
        teamDeadline: at(DAY_MS),
        ideaDeadline: at(2 * DAY_MS),
        milestones: [milestone("M1", at(3 * DAY_MS), at(4 * DAY_MS))],
      },
    });
    cycleId = created.body.id;
    m1 = created.body.milestones[0].id;
    await owner.post(`/course-cycles/${cycleId}/publish`);
    const team = await student.post<{ id: string }>(
      `/course-cycles/${cycleId}/teams`,
      { body: { name: "Falcon", memberIds: [] } },
    );
    teamId = team.body.id;
    clock.advance(4 * DAY_MS);
  });
  after(() => app.close());

  it("one release wins, the second is refused, every save ends in one continuous history, and the student sees the latest", async () => {
    const path = `/course-cycles/${cycleId}/milestones/${m1}`;
    const first = await owner.put(`${path}/teams/${teamId}/evaluation`, {
      body: { feedback: "First" },
    });
    assert.equal(first.status, 200);

    const replies = await Promise.all([
      owner.post(`${path}/grading/release`),
      owner.put(`${path}/teams/${teamId}/evaluation`, {
        body: { feedback: "Second", expectedVersion: 1 },
      }),
      owner.post(`${path}/grading/release`),
    ]);

    const [releaseA, saved, releaseB] = replies;
    assert.equal(saved.status, 200);
    assert.deepEqual(
      [releaseA.status, releaseB.status].sort((a, b) => a - b),
      [200, 409],
    );
    const refused = releaseA.status === 409 ? releaseA : releaseB;
    assert.equal(refused.body.code, "ALREADY_RELEASED");
    assert.ok(replies.every((reply) => reply.status < 500));

    const seen = await student.get<{ feedback: string }[]>(
      `${path}/teams/${teamId}/evaluations`,
    );
    assert.equal(seen.body[0].feedback, "Second");
    const revisions = await app.prisma.evaluationRevision.findMany({
      orderBy: { version: "asc" },
    });
    assert.deepEqual(
      revisions.map(({ version }) => version),
      [1, 2],
    );
    const released = await app.prisma.auditLog.count({
      where: { action: "EVALUATION_RELEASED" },
    });
    assert.equal(released, 1);
  });
});
