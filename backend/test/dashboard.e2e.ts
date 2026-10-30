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

interface Card {
  cycle: { id: string; title: string; status: string };
  myRole: string;
  myTeam: { name: string } | null;
  todo: string | null;
  results: { marks: number | null }[];
}
interface Dashboard {
  upNext: {
    cycle: { id: string };
    kind: string;
    text: string;
    action?: { tab: string; actionable: boolean };
  }[];
  updates: { kind: string; text: string; cycle: { id: string } }[];
  projects: { active: Card[]; past: Card[] };
}

// Phase 9: the student dashboard read model (ADR 021) and past projects (S4, ADR 022).
describe("Student dashboard", () => {
  const clock = new FixedClock(new Date());
  let app: TestApp;
  let owner: TestBrowser;
  const s = {} as Record<"aman" | "neha" | "kiran" | "counter", TestBrowser>;
  const ids = {} as Record<keyof typeof s, string>;
  let active = "";
  let past = "";
  const at = (offset: number) =>
    new Date(clock.now().getTime() + offset).toISOString();

  async function cycle(title: string, batchYear: number, publish = true) {
    const created = await owner.post<{ id: string }>("/course-cycles", {
      body: {
        courseName: "Software Design",
        title,
        batchYear,
        semester: 7,
        academicYear: "2026-27",
        minTeamSize: 1,
        maxTeamSize: 3,
        teamDeadline: at(2 * DAY_MS),
        ideaDeadline: at(4 * DAY_MS),
        milestones: [
          milestone("Design review", at(4 * DAY_MS), at(10 * DAY_MS)),
        ],
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    if (publish)
      assert.equal(
        (await owner.post(`/course-cycles/${created.body.id}/publish`)).status,
        200,
      );
    return created.body.id;
  }
  const dashboard = async (who: TestBrowser) => {
    const response = await who.get<Dashboard>("/me/dashboard");
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return response.body;
  };
  const cardOf = (board: Dashboard, cycleId: string) =>
    [...board.projects.active, ...board.projects.past].find(
      (card) => card.cycle.id === cycleId,
    );

  before(async () => {
    app = await startTestApp({ clock });
    await app.reset();
    const admin = await app.browser().signIn(BOOTSTRAP_ADMIN);
    await admin.post("/admin/faculty-allowlist", {
      body: { email: `vatsala.s${DOMAIN}` },
    });
    owner = await app.browser().signIn(`vatsala.s${DOMAIN}`);
    for (const [key, email] of [
      ["aman", `aman.k26csai${DOMAIN}`],
      ["neha", `neha.t26csai${DOMAIN}`],
      ["kiran", `kiran.p26csai${DOMAIN}`],
      ["counter", `count.z27csai${DOMAIN}`],
    ] as const) {
      s[key] = await app.browser().signIn(email, key);
      ids[key] = String((await s[key].get("/auth/me")).body.id);
    }
    // A finished project: Aman and Neha were a team; Kiran (same batch) never joined one.
    past = await cycle("Last term", 2026);
    await s.aman.post(`/course-cycles/${past}/teams`, {
      body: { name: "Old Falcon", memberIds: [ids.neha] },
    });
    assert.equal(
      (await owner.post(`/course-cycles/${past}/close`)).status,
      200,
    );
    // The current project: Aman leads Falcon with Neha; Kiran has no team yet.
    active = await cycle("This term", 2026);
    const falcon = await s.aman.post<{ id: string }>(
      `/course-cycles/${active}/teams`,
      {
        body: { name: "Falcon", memberIds: [ids.neha] },
      },
    );
    assert.equal(falcon.status, 201);
  });
  after(() => app.close());

  it("tells the leader to submit the idea, and a member that it is the leader's to do", async () => {
    const leader = await dashboard(s.aman);
    const card = cardOf(leader, active)!;
    assert.deepEqual(
      [card.myRole, card.myTeam?.name, card.todo],
      ["LEADER", "Falcon", "Submit or pick your team's idea"],
    );
    assert.deepEqual(leader.upNext[0], {
      ...leader.upNext[0],
      kind: "SUBMIT_IDEA",
      action: { tab: "idea", actionable: true },
    });
    const member = await dashboard(s.neha);
    assert.equal(cardOf(member, active)!.myRole, "MEMBER");
    assert.deepEqual(member.upNext[0].action, {
      tab: "idea",
      actionable: false,
    });
    assert.ok(
      member.updates.some(
        (u) => u.kind === "JOINED_TEAM" && u.cycle.id === active,
      ),
    );
  });

  it("asks a student without a team to join one, then lists the dates", async () => {
    const loner = await dashboard(s.kiran);
    const card = cardOf(loner, active)!;
    assert.deepEqual(
      [card.myRole, card.todo],
      ["NO_TEAM", "Create or join a team"],
    );
    assert.equal(loner.upNext[0].kind, "JOIN_TEAM");
    assert.ok(
      loner.upNext.slice(1).every((item) => !item.action),
      "actions come before dates",
    );
    assert.ok(loner.upNext.some((item) => item.kind === "TEAM_DEADLINE"));
  });

  it("shows idea feedback as an update", async () => {
    const mine = (
      await s.aman.get<{ id: string; cycleId: string }[]>("/teams/mine")
    ).body.find((t) => t.cycleId === active)!;
    const idea = await s.aman.put<{ version: number }>(
      `/teams/${mine.id}/idea`,
      {
        body: {
          title: "Lost and found",
          problem: "Things get lost",
          solution: "A board",
        },
      },
    );
    await owner.post(`/teams/${mine.id}/idea/review`, {
      body: {
        version: idea.body.version,
        decision: "REJECTED",
        feedback: "Too broad",
      },
    });
    const board = await dashboard(s.neha);
    assert.ok(
      board.updates.some(
        (u) => u.kind === "IDEA_REJECTED" && u.cycle.id === active,
      ),
    );
    assert.equal(
      cardOf(board, active)!.todo,
      "Your idea was rejected; your leader revises it",
    );
  });

  it("keeps a closed project for its former team members only, read-only", async () => {
    const member = await dashboard(s.neha);
    assert.deepEqual(
      member.projects.past.map((c) => c.cycle.id),
      [past],
    );
    assert.ok(!member.projects.active.some((c) => c.cycle.id === past));
    assert.equal((await s.neha.get(`/course-cycles/${past}`)).status, 200);
    const loner = await dashboard(s.kiran);
    assert.deepEqual(loner.projects.past, []);
    assert.equal((await s.kiran.get(`/course-cycles/${past}`)).status, 404);
    // Read-only: nothing can change in a closed project.
    const oldTeam = (
      await s.neha.get<{ id: string; cycleId: string }[]>("/teams/mine")
    ).body.find((t) => t.cycleId === past)!;
    assert.equal((await s.neha.get(`/teams/${oldTeam.id}`)).status, 200);
    const change = await s.aman.patch(`/teams/${oldTeam.id}`, {
      body: { name: "Renamed" },
    });
    assert.equal(change.status, 409);
    const idea = await s.aman.put(`/teams/${oldTeam.id}/idea`, {
      body: { title: "Late", problem: "P", solution: "S" },
    });
    assert.equal(idea.status, 409);
  });

  it("reads every source once, whether the student has 1 project or 5", async () => {
    const countQueries = async () => {
      let count = 0;
      const listener = () => {
        count += 1;
      };
      (
        app.prisma as unknown as {
          $on: (event: "query", cb: () => void) => void;
        }
      ).$on("query", listener);
      const before = count;
      await dashboard(s.counter);
      return count - before;
    };
    const first = await cycle("Count 1", 2027);
    await s.counter.post(`/course-cycles/${first}/teams`, {
      body: { name: "Counter 1", memberIds: [] },
    });
    const one = await countQueries();
    for (let n = 2; n <= 5; n += 1) {
      const id = await cycle(`Count ${n}`, 2027);
      await s.counter.post(`/course-cycles/${id}/teams`, {
        body: { name: `Counter ${n}`, memberIds: [] },
      });
    }
    const five = await countQueries();
    assert.equal((await dashboard(s.counter)).projects.active.length, 5);
    assert.ok(one > 0);
    assert.equal(five, one, `queries for 1 project: ${one}, for 5: ${five}`);
  });

  it("is for students only", async () => {
    assert.equal((await owner.get("/me/dashboard")).status, 403);
  });
});
