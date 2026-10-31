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
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// H10 (SEC-F1): one member posted 100 versions in 0.9 s, and every write was unlimited.
describe("Write limits per user", () => {
  // On a minute boundary, so each check starts a fresh window.
  const clock = new FixedClock("2026-11-04T09:00:00.000Z");
  let app: TestApp;
  let leader: TestBrowser;
  let member: TestBrowser;
  let teamId = "";
  let m1 = "";

  const at = (offset: number) =>
    new Date(clock.now().getTime() + offset).toISOString();
  const submit = (who: TestBrowser, n: number) =>
    who.post(`/teams/${teamId}/milestones/${m1}/submissions`, {
      body: { links: [{ type: "GITHUB", url: `https://github.com/f/v${n}` }] },
    });

  before(async () => {
    app = await startTestApp({
      clock,
      env: {
        SUBMISSION_RATE_LIMIT_PER_MINUTE: "10",
        SUBMISSION_VERSION_LIMIT: "13",
        WRITE_RATE_LIMIT_PER_MINUTE: "12",
      },
    });
    await app.reset();
    const admin = await app.browser().signIn(BOOTSTRAP_ADMIN);
    await admin.post("/admin/faculty-allowlist", {
      body: { email: `vatsala.s${DOMAIN}` },
    });
    const owner = await app.browser().signIn(`vatsala.s${DOMAIN}`);
    leader = await app.browser().signIn(`aman.k26csai${DOMAIN}`);
    member = await app.browser().signIn(`neha.t26csai${DOMAIN}`);
    const memberId = String((await member.get("/auth/me")).body.id);
    const created = await owner.post<{
      id: string;
      milestones: { id: string }[];
    }>("/course-cycles", {
      body: {
        courseName: "Software Design",
        title: "Limits",
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
    m1 = created.body.milestones[0].id;
    await owner.post(`/course-cycles/${created.body.id}/publish`);
    teamId = (
      await leader.post<{ id: string }>(
        `/course-cycles/${created.body.id}/teams`,
        { body: { name: "Falcon", memberIds: [memberId] } },
      )
    ).body.id;
    const idea = await leader.put<{ version: number }>(
      `/teams/${teamId}/idea`,
      { body: { title: "Lost and found", problem: "P", solution: "S" } },
    );
    await owner.post(`/teams/${teamId}/idea/review`, {
      body: { version: idea.body.version, decision: "APPROVED" },
    });
    clock.advance(3 * HOUR_MS); // M1 is open, and every limit starts a new minute.
  });
  after(() => app.close());

  it("lets one member submit 10 versions a minute, refuses the 11th, and leaves the team's other members free", async () => {
    const statuses: number[] = [];
    for (let n = 1; n <= 11; n += 1) {
      statuses.push((await submit(leader, n)).status);
    }
    assert.deepEqual(statuses, [...Array<number>(10).fill(201), 429]);
    assert.equal((await submit(member, 12)).status, 201);
    assert.equal(
      (await leader.get(`/teams/${teamId}/milestones/${m1}/submissions`))
        .status,
      200,
      "reads are never counted",
    );
  });

  it("caps a team's versions for a milestone with 409 VERSION_LIMIT_REACHED", async () => {
    // 11 versions so far; the cap is 13.
    clock.advance(MINUTE_MS);
    assert.equal((await submit(member, 13)).status, 201);
    assert.equal((await submit(member, 14)).status, 201);
    const over = await submit(member, 15);
    assert.equal(over.status, 409);
    assert.equal(over.body.code, "VERSION_LIMIT_REACHED");
  });

  it("counts every other authenticated write per user, refused or not", async () => {
    clock.advance(MINUTE_MS);
    const statuses: number[] = [];
    for (let n = 1; n <= 13; n += 1) {
      // The team deadline has passed, so each rename is refused (409); each still counts.
      const rename = await leader.patch(`/teams/${teamId}`, {
        body: { name: `Falcon ${n}` },
      });
      statuses.push(rename.status);
    }
    assert.ok(!statuses.slice(0, 12).includes(429), statuses.join(","));
    assert.equal(statuses[12], 429);
    assert.equal((await leader.get(`/teams/${teamId}`)).status, 200);
    assert.equal((await member.post("/auth/logout")).status, 204);
  });
});
