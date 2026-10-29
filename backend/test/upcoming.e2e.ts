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

interface UpcomingBody {
  kind: string;
  at: string;
  milestone?: { name: string };
  cycle: { id: string; title: string };
}

// Phase 8: a student's upcoming events are computed from their visible cycles' dates (ADR 017).
describe("Upcoming events", () => {
  const clock = new FixedClock(new Date());
  let app: TestApp;
  let owner: TestBrowser;
  let student26: TestBrowser;
  let student25: TestBrowser;

  const at = (offsetMs: number) =>
    new Date(clock.now().getTime() + offsetMs).toISOString();

  before(async () => {
    app = await startTestApp({ clock });
    await app.reset();
    const admin = await app.browser().signIn(BOOTSTRAP_ADMIN);
    await admin.post("/admin/faculty-allowlist", {
      body: { email: `vatsala.s${DOMAIN}` },
    });
    owner = await app.browser().signIn(`vatsala.s${DOMAIN}`);
    student26 = await app.browser().signIn(`aman.k26csai${DOMAIN}`);
    student25 = await app.browser().signIn(`older.r25csai${DOMAIN}`);
  });
  after(() => app.close());

  async function cycle(
    title: string,
    batchYear: number,
    startDay: number,
    publish = true,
  ) {
    const created = await owner.post<{ id: string }>("/course-cycles", {
      body: {
        courseName: "Software Design",
        title,
        batchYear,
        semester: 7,
        academicYear: "2026-27",
        teamDeadline: at(startDay * DAY_MS),
        ideaDeadline: at((startDay + 2) * DAY_MS),
        milestones: [
          milestone(
            "Prototype",
            at((startDay + 2) * DAY_MS),
            at((startDay + 9) * DAY_MS),
          ),
          milestone(
            "Final",
            at((startDay + 9) * DAY_MS),
            at((startDay + 20) * DAY_MS),
          ),
        ],
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    if (publish) {
      assert.equal(
        (await owner.post(`/course-cycles/${created.body.id}/publish`)).status,
        200,
      );
    }
    return created.body.id;
  }

  it("lists only the student's own visible cycles, soonest first, at most 10", async () => {
    const early = await cycle("Early", 2026, 1);
    const late = await cycle("Late", 2026, 4);
    const otherBatch = await cycle("Other batch", 2025, 0);
    const draft = await cycle("Draft", 2026, 0, false);

    const upcoming = await student26.get<UpcomingBody[]>("/me/upcoming");
    assert.equal(upcoming.status, 200);
    assert.equal(upcoming.body.length, 10);
    const cycles = new Set(upcoming.body.map((event) => event.cycle.id));
    assert.ok(cycles.has(early) && cycles.has(late));
    assert.ok(!cycles.has(otherBatch) && !cycles.has(draft));
    const times = upcoming.body.map((event) => event.at);
    assert.deepEqual(times, [...times].sort());
    assert.deepEqual(
      upcoming.body.slice(0, 3).map((event) => [event.cycle.title, event.kind]),
      [
        ["Early", "TEAM_DEADLINE"],
        ["Early", "IDEA_DEADLINE"],
        ["Early", "SUBMISSION_OPENS"],
      ],
    );

    // Another batch sees only its own cycle; a past event is gone.
    const theirs = await student25.get<UpcomingBody[]>("/me/upcoming");
    assert.deepEqual(
      [...new Set(theirs.body.map((event) => event.cycle.id))],
      [otherBatch],
    );
    clock.advance(DAY_MS + HOUR_MS);
    const later = await student26.get<UpcomingBody[]>("/me/upcoming");
    assert.ok(
      !later.body.some(
        (event) => event.cycle.id === early && event.kind === "TEAM_DEADLINE",
      ),
    );

    // Only students have upcoming events of their own.
    assert.equal((await owner.get("/me/upcoming")).status, 403);
  });
});
