import { after, before, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { FixedClock } from "../src/common/testing/fixed-clock";
import {
  auditActions,
  BOOTSTRAP_ADMIN,
  DOMAIN,
  startTestApp,
  TestApp,
} from "./support/test-app";
import { milestone } from "./support/schedule";
import { TestBrowser } from "./support/test-browser";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

type Student = "aman" | "neha" | "ravi" | "priya" | "kiran";

const EMAILS: Record<Student, string> = {
  aman: `aman.k26csai${DOMAIN}`,
  neha: `neha.t26csai${DOMAIN}`,
  ravi: `ravi.b26csai${DOMAIN}`,
  priya: `priya.m26csai${DOMAIN}`,
  kiran: `kiran.p26csai${DOMAIN}`,
};

interface IdeaBody {
  id: string;
  title: string;
  problem: string;
  solution: string | null;
  links: { type: string; url: string }[];
  source: string;
  catalogIdeaId: string | null;
  status: string;
  version: number;
  submittedBy: { id: string };
  reviews: { version: number; decision: string; feedback: string | null }[];
  code?: string;
}

const content = {
  title: "Campus lost and found",
  problem: "Things get lost on campus and nobody knows where to look",
  solution: "A board with photos, owners notified by email",
  links: [{ type: "GITHUB", url: "https://github.com/falcon/lost-and-found" }],
};

describe("Ideas", () => {
  // Each test builds its cycle relative to this clock and moves it past deadlines.
  const clock = new FixedClock(new Date());
  let app: TestApp;
  let admin: TestBrowser;
  let owner: TestBrowser;
  let otherFaculty: TestBrowser;
  const students = {} as Record<Student, TestBrowser>;
  const ids = {} as Record<Student, string>;

  before(async () => {
    app = await startTestApp({ clock });
    await app.reset();
    admin = await app.browser().signIn(BOOTSTRAP_ADMIN);
    for (const email of [`vatsala.s${DOMAIN}`, `anil.kr${DOMAIN}`]) {
      await admin.post("/admin/faculty-allowlist", { body: { email } });
    }
    owner = await app.browser().signIn(`vatsala.s${DOMAIN}`);
    otherFaculty = await app.browser().signIn(`anil.kr${DOMAIN}`);
    for (const [key, email] of Object.entries(EMAILS)) {
      const name = key[0].toUpperCase() + key.slice(1);
      const browser = await app.browser().signIn(email, name);
      students[key as Student] = browser;
      ids[key as Student] = String((await browser.get("/auth/me")).body.id);
    }
  });
  after(() => app.close());

  const at = (offsetMs: number) =>
    new Date(clock.now().getTime() + offsetMs).toISOString();

  /**
   * Published, batch 2026, 1 to 3 members. Students form teams for an hour,
   * the faculty place the rest until ideas are due after three hours, and the
   * first milestone opens after a day.
   */
  async function openCycle(overrides: Record<string, unknown> = {}) {
    const created = await owner.post("/course-cycles", {
      body: {
        courseName: "Software Design",
        title: "Ideas",
        batchYear: 2026,
        semester: 7,
        academicYear: "2026-27",
        minTeamSize: 1,
        maxTeamSize: 3,
        teamDeadline: at(HOUR_MS),
        ideaDeadline: at(3 * HOUR_MS),
        milestones: [milestone("Final", at(DAY_MS), at(30 * DAY_MS))],
        ...overrides,
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const cycleId = String(created.body.id);
    const published = await owner.post(`/course-cycles/${cycleId}/publish`);
    assert.equal(published.status, 200, JSON.stringify(published.body));
    return cycleId;
  }

  async function team(cycleId: string, leader: Student, members: Student[]) {
    const created = await students[leader].post<{ id: string }>(
      `/course-cycles/${cycleId}/teams`,
      {
        body: {
          name: `${leader}'s team`,
          memberIds: members.map((member) => ids[member]),
        },
      },
    );
    assert.equal(created.status, 201, JSON.stringify(created.body));
    return created.body.id;
  }

  const submit = (leader: Student, teamId: string, body: object = content) =>
    students[leader].put<IdeaBody>(`/teams/${teamId}/idea`, { body });

  const review = (
    teamId: string,
    body: { version: number; decision: string; feedback?: string },
    reviewer = owner,
  ) => reviewer.post<IdeaBody>(`/teams/${teamId}/idea/review`, { body });

  const pick = (leader: Student, teamId: string, catalogIdeaId: string) =>
    students[leader].post<IdeaBody>(`/teams/${teamId}/idea/pick`, {
      body: { catalogIdeaId },
    });

  interface CatalogBody {
    id: string;
    title: string;
    description: string;
    link: string | null;
    pickCount: number;
    code?: string;
  }

  const offer = async (cycleId: string, title = "Library seat finder") => {
    const added = await owner.post<CatalogBody>(
      `/course-cycles/${cycleId}/idea-catalog`,
      {
        body: {
          title,
          description: "Show which library seats are free right now",
          link: "https://example.edu/briefs/seats",
        },
      },
    );
    assert.equal(added.status, 201, JSON.stringify(added.body));
    return added.body;
  };

  describe("the idea deadline", () => {
    it("is required, comes after the team deadline, and by the time the first milestone opens", async () => {
      const base = {
        courseName: "Software Design",
        title: "Dates",
        batchYear: 2026,
        semester: 7,
        academicYear: "2026-27",
        teamDeadline: at(HOUR_MS),
        milestones: [milestone("Final", at(DAY_MS), at(30 * DAY_MS))],
      };
      // Phase 8: no default any more (it used to follow the completion deadline).
      const missing = await owner.post("/course-cycles", { body: base });
      assert.equal(missing.body.code, "VALIDATION_FAILED");
      const created = await owner.post("/course-cycles", {
        body: { ...base, ideaDeadline: at(2 * HOUR_MS) },
      });
      assert.equal(created.body.ideaDeadline, at(2 * HOUR_MS));
      for (const [ideaDeadline, code] of [
        [at(HOUR_MS), "INVALID_IDEA_DEADLINE"],
        [at(DAY_MS + MINUTE_MS), "INVALID_MILESTONE_SCHEDULE"],
      ]) {
        const refused = await owner.post("/course-cycles", {
          body: { ...base, ideaDeadline },
        });
        assert.equal(refused.status, 400);
        assert.equal(refused.body.code, code);
      }
      const late = await owner.post("/course-cycles", {
        body: {
          ...base,
          ideaDeadline: at(2 * HOUR_MS),
          teamDeadline: at(3 * HOUR_MS),
        },
      });
      assert.equal(late.body.code, "INVALID_IDEA_DEADLINE");
    });

    it("moves while open on a published cycle, and never once passed", async () => {
      const cycleId = await openCycle();
      const moved = await owner.patch(`/course-cycles/${cycleId}`, {
        body: { ideaDeadline: at(5 * HOUR_MS) },
      });
      assert.equal(moved.status, 200, JSON.stringify(moved.body));
      clock.advance(5 * HOUR_MS + MINUTE_MS);
      const locked = await owner.patch(`/course-cycles/${cycleId}`, {
        body: { ideaDeadline: at(2 * HOUR_MS) },
      });
      assert.equal(locked.status, 409);
      assert.equal(locked.body.code, "CYCLE_FIELD_LOCKED");
    });
  });

  describe("submitting", () => {
    it("is for the leader; members read the idea, other students cannot see it", async () => {
      const cycleId = await openCycle();
      const teamId = await team(cycleId, "aman", ["neha"]);
      const empty = await students.neha.get(`/teams/${teamId}/idea`);
      assert.deepEqual(empty.body, { teamId, idea: null });

      const submitted = await submit("aman", teamId, {
        ...content,
        title: "  Campus lost and found ",
      });
      assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
      assert.equal(submitted.body.title, "Campus lost and found");
      assert.equal(submitted.body.status, "SUBMITTED");
      assert.equal(submitted.body.version, 1);
      assert.equal(submitted.body.submittedBy.id, ids.aman);

      const read = await students.neha.get<{ idea: IdeaBody }>(
        `/teams/${teamId}/idea`,
      );
      assert.equal(read.body.idea.id, submitted.body.id);

      const byMember = await submit("neha", teamId);
      assert.equal(byMember.status, 403);
      assert.equal(byMember.body.code, "NOT_TEAM_LEADER");
      const outsider = await students.ravi.get(`/teams/${teamId}/idea`);
      assert.equal(outsider.status, 404);
      assert.equal(outsider.body.code, "TEAM_NOT_FOUND");
    });

    it("rejects blank content and links that do not fit the requirement", async () => {
      const cycleId = await openCycle();
      const teamId = await team(cycleId, "aman", []);
      for (const [body, code] of [
        [{ ...content, title: "   " }, "VALIDATION_FAILED"],
        [{ ...content, solution: "" }, "VALIDATION_FAILED"],
        [
          {
            ...content,
            links: [{ type: "GITHUB", url: "ftp://files.example.com/idea" }],
          },
          "INVALID_LINK",
        ],
        [
          { ...content, links: [{ type: "GITHUB", url: "not a url" }] },
          "INVALID_LINK",
        ],
        [
          { ...content, links: [{ type: "DEMO", url: "https://falcon.app" }] },
          "LINK_NOT_ALLOWED",
        ],
      ] as const) {
        const refused = await submit("aman", teamId, body);
        assert.equal(refused.status, 400, JSON.stringify(body));
        assert.equal(refused.body.code, code);
      }
      const noLink = await submit("aman", teamId, { ...content, links: [] });
      assert.equal(noLink.status, 200);
      assert.deepEqual(noLink.body.links, []);
    });

    it("lets the leader change a waiting idea, as new versions, until the idea deadline", async () => {
      const cycleId = await openCycle();
      const teamId = await team(cycleId, "aman", []);
      const other = await team(cycleId, "priya", []);
      await submit("aman", teamId);
      const changed = await submit("aman", teamId, {
        ...content,
        title: "Lost and found for hostels",
      });
      assert.equal(changed.body.version, 2);
      assert.equal(changed.body.status, "SUBMITTED");

      clock.advance(3 * HOUR_MS);
      const late = await submit("aman", teamId);
      assert.equal(late.status, 409);
      assert.equal(late.body.code, "IDEA_SUBMISSION_CLOSED");
      const firstLate = await submit("priya", other);
      assert.equal(firstLate.status, 409);
      assert.equal(firstLate.body.code, "IDEA_SUBMISSION_CLOSED");
    });

    it("gives teams the faculty make after the students' deadline time to submit", async () => {
      const cycleId = await openCycle();
      clock.advance(HOUR_MS + MINUTE_MS);
      const placed = await owner.post<{ id: string }>(
        `/course-cycles/${cycleId}/team-completion/teams`,
        {
          body: {
            name: "Placed",
            leaderId: ids.kiran,
            memberIds: [ids.ravi],
          },
        },
      );
      assert.equal(placed.status, 201, JSON.stringify(placed.body));
      clock.advance(90 * MINUTE_MS);
      assert.equal((await submit("kiran", placed.body.id)).status, 200);
    });

    it("goes with the team when the leader disbands it before formation ends", async () => {
      const cycleId = await openCycle();
      const teamId = await team(cycleId, "aman", ["neha"]);
      await submit("aman", teamId);
      assert.equal(
        (await students.aman.delete(`/teams/${teamId}`)).status,
        204,
      );
      assert.equal(
        await app.prisma.projectIdea.count({ where: { teamId } }),
        0,
      );
    });
  });

  describe("reviewing", () => {
    it("lists every team of the cycle for its faculty and admins, with or without an idea", async () => {
      const cycleId = await openCycle();
      const withIdea = await team(cycleId, "aman", ["neha"]);
      await team(cycleId, "priya", []);
      await submit("aman", withIdea);

      const list = await owner.get<
        {
          team: { name: string; leader: { name: string }; memberCount: number };
          idea: IdeaBody | null;
        }[]
      >(`/course-cycles/${cycleId}/ideas`);
      assert.equal(list.status, 200);
      assert.deepEqual(
        list.body
          .map((row) => [
            row.team.name,
            row.team.leader.name,
            row.team.memberCount,
            row.idea?.status ?? null,
          ])
          .sort(),
        [
          ["aman's team", "Aman", 2, "SUBMITTED"],
          ["priya's team", "Priya", 1, null],
        ],
      );
      assert.equal(
        (await admin.get(`/course-cycles/${cycleId}/ideas`)).status,
        200,
      );
      const hidden = await otherFaculty.get(`/course-cycles/${cycleId}/ideas`);
      assert.equal(hidden.status, 404);
      assert.equal(
        (await students.aman.get(`/course-cycles/${cycleId}/ideas`)).status,
        403,
      );
    });

    it("decides the version the faculty read; a rejection needs feedback; only the owner decides", async () => {
      const cycleId = await openCycle();
      const teamId = await team(cycleId, "aman", []);
      await submit("aman", teamId);
      await submit("aman", teamId, { ...content, title: "Second take" });

      const stale = await review(teamId, { version: 1, decision: "APPROVED" });
      assert.equal(stale.status, 409);
      assert.equal(stale.body.code, "IDEA_CHANGED");
      const silent = await review(teamId, { version: 2, decision: "REJECTED" });
      assert.equal(silent.status, 400);
      assert.equal(silent.body.code, "IDEA_FEEDBACK_REQUIRED");
      assert.equal(
        (
          await review(
            teamId,
            { version: 2, decision: "APPROVED" },
            otherFaculty,
          )
        ).status,
        404,
      );
      assert.equal(
        (await review(teamId, { version: 2, decision: "APPROVED" }, admin))
          .status,
        403,
      );

      const rejected = await review(teamId, {
        version: 2,
        decision: "REJECTED",
        feedback: "  Narrow it to hostels  ",
      });
      assert.equal(rejected.status, 200, JSON.stringify(rejected.body));
      assert.equal(rejected.body.status, "REJECTED");
      assert.deepEqual(
        rejected.body.reviews.map((entry) => [
          entry.version,
          entry.decision,
          entry.feedback,
        ]),
        [[2, "REJECTED", "Narrow it to hostels"]],
      );
      const again = await review(teamId, { version: 2, decision: "APPROVED" });
      assert.equal(again.body.code, "IDEA_NOT_AWAITING_REVIEW");
    });

    it("lets a rejected team resubmit after the idea deadline; approval is final", async () => {
      const cycleId = await openCycle();
      const teamId = await team(cycleId, "aman", ["neha"]);
      const first = await submit("aman", teamId);
      clock.advance(3 * HOUR_MS + MINUTE_MS);
      await review(teamId, {
        version: 1,
        decision: "REJECTED",
        feedback: "Too broad",
      });

      const resubmitted = await submit("aman", teamId, {
        ...content,
        title: "Lost and found for hostels",
      });
      assert.equal(resubmitted.status, 200, JSON.stringify(resubmitted.body));
      assert.equal(resubmitted.body.status, "SUBMITTED");
      assert.equal(resubmitted.body.version, 2);

      const approved = await review(teamId, {
        version: 2,
        decision: "APPROVED",
      });
      assert.equal(approved.body.status, "APPROVED");
      assert.deepEqual(
        approved.body.reviews.map((entry) => [entry.version, entry.decision]),
        [
          [2, "APPROVED"],
          [1, "REJECTED"],
        ],
      );
      const final = await submit("aman", teamId);
      assert.equal(final.status, 409);
      assert.equal(final.body.code, "IDEA_ALREADY_APPROVED");

      assert.deepEqual(
        (await auditActions(app.prisma, { entityId: first.body.id })).map(
          (entry) => [entry.action, entry.metadata.version],
        ),
        [
          ["IDEA_SUBMITTED", 1],
          ["IDEA_REJECTED", 1],
          ["IDEA_SUBMITTED", 2],
          ["IDEA_APPROVED", 2],
        ],
      );
      // The idea never changes the team.
      const members = await students.neha.get<{ members: unknown[] }>(
        `/teams/${teamId}`,
      );
      assert.equal(members.body.members.length, 2);
    });

    it("keeps the feedback rounds going after submissions open and close (ADR 014)", async () => {
      const cycleId = await openCycle();
      const teamId = await team(cycleId, "aman", []);
      await submit("aman", teamId);
      await review(teamId, {
        version: 1,
        decision: "REJECTED",
        feedback: "Too broad",
      });
      clock.advance(DAY_MS);
      const second = await submit("aman", teamId);
      assert.equal(second.status, 200, JSON.stringify(second.body));
      assert.equal(second.body.version, 2);
      await review(teamId, {
        version: 2,
        decision: "REJECTED",
        feedback: "Still too broad",
      });
      clock.advance(30 * DAY_MS);
      const third = await submit("aman", teamId);
      assert.equal(third.status, 200, JSON.stringify(third.body));
      assert.equal(
        (await review(teamId, { version: 3, decision: "APPROVED" })).body
          .status,
        "APPROVED",
      );
    });

    it("stops when the cycle closes", async () => {
      const cycleId = await openCycle();
      const teamId = await team(cycleId, "aman", []);
      await submit("aman", teamId);
      await owner.post(`/course-cycles/${cycleId}/close`);
      const closed = await review(teamId, { version: 1, decision: "APPROVED" });
      assert.equal(closed.status, 409);
      assert.equal(closed.body.code, "IDEA_REVIEW_CLOSED");
      assert.equal(
        (await submit("aman", teamId)).body.code,
        "IDEA_SUBMISSION_CLOSED",
      );
    });
  });

  describe("the faculty's catalog", () => {
    it("is read by the cycle's students, faculty and admins, and changed only by its owner", async () => {
      const cycleId = await openCycle();
      const offered = await offer(cycleId);
      assert.equal(offered.pickCount, 0);
      for (const reader of [students.aman, owner, admin]) {
        const list = await reader.get<CatalogBody[]>(
          `/course-cycles/${cycleId}/idea-catalog`,
        );
        assert.deepEqual(
          list.body.map((entry) => entry.title),
          ["Library seat finder"],
        );
      }
      const otherAdd = await otherFaculty.post<CatalogBody>(
        `/course-cycles/${cycleId}/idea-catalog`,
        { body: { title: "Mine", description: "D" } },
      );
      assert.equal(otherAdd.status, 404);
      const blank = await owner.post(`/course-cycles/${cycleId}/idea-catalog`, {
        body: { title: " ", description: "D" },
      });
      assert.equal(blank.status, 400);

      const edited = await owner.put<CatalogBody>(
        `/course-cycles/${cycleId}/idea-catalog/${offered.id}`,
        {
          body: { title: "Seat finder", description: "Free seats", link: null },
        },
      );
      assert.equal(edited.status, 200, JSON.stringify(edited.body));
      assert.equal(edited.body.link, null);
      const removed = await owner.delete(
        `/course-cycles/${cycleId}/idea-catalog/${offered.id}`,
      );
      assert.equal(removed.status, 204);
      assert.deepEqual(
        (await auditActions(app.prisma, { entityId: offered.id })).map(
          (entry) => entry.action,
        ),
        ["CATALOG_IDEA_ADDED", "CATALOG_IDEA_UPDATED", "CATALOG_IDEA_REMOVED"],
      );
    });

    it("lets any number of teams pick an idea, approved at once, and keeps a picked idea", async () => {
      const cycleId = await openCycle();
      const offered = await offer(cycleId);
      const falcon = await team(cycleId, "aman", ["neha"]);
      const kestrel = await team(cycleId, "ravi", []);

      const byMember = await pick("neha", falcon, offered.id);
      assert.equal(byMember.status, 403);
      assert.equal(byMember.body.code, "NOT_TEAM_LEADER");
      const picked = await pick("aman", falcon, offered.id);
      assert.equal(picked.status, 200, JSON.stringify(picked.body));
      assert.equal(picked.body.status, "APPROVED");
      assert.equal(picked.body.source, "CATALOG");
      assert.equal(
        picked.body.problem,
        "Show which library seats are free right now",
      );
      assert.equal(picked.body.solution, null);
      assert.equal((await pick("ravi", kestrel, offered.id)).status, 200);

      const listed = await students.aman.get<CatalogBody[]>(
        `/course-cycles/${cycleId}/idea-catalog`,
      );
      assert.equal(listed.body[0].pickCount, 2);
      const removal = await owner.delete(
        `/course-cycles/${cycleId}/idea-catalog/${offered.id}`,
      );
      assert.equal(removal.status, 409);
      assert.equal(
        (removal.body as { code: string }).code,
        "CATALOG_IDEA_PICKED",
      );
      // Editing the catalog changes later picks only; the team keeps its copy.
      await owner.put(`/course-cycles/${cycleId}/idea-catalog/${offered.id}`, {
        body: { title: "Renamed", description: "Changed" },
      });
      const kept = await students.neha.get<{ idea: IdeaBody }>(
        `/teams/${falcon}/idea`,
      );
      assert.equal(kept.body.idea.title, "Library seat finder");
      // A picked idea is final, and faculty have nothing to review.
      assert.equal(
        (await submit("aman", falcon)).body.code,
        "IDEA_ALREADY_APPROVED",
      );
      assert.equal(
        (
          await review(falcon, {
            version: 1,
            decision: "REJECTED",
            feedback: "No",
          })
        ).body.code,
        "IDEA_NOT_AWAITING_REVIEW",
      );
      assert.deepEqual(
        (await auditActions(app.prisma, { entityId: picked.body.id })).map(
          (entry) => [entry.action, entry.metadata.catalogIdeaId],
        ),
        [["IDEA_PICKED", offered.id]],
      );
    });

    it("replaces a waiting proposal before the deadline, or a rejected one after it, but is no late first idea", async () => {
      const cycleId = await openCycle();
      const offered = await offer(cycleId);
      const falcon = await team(cycleId, "aman", []);
      const kestrel = await team(cycleId, "ravi", []);
      const latecomer = await team(cycleId, "priya", []);
      await submit("aman", falcon);
      const instead = await pick("aman", falcon, offered.id);
      assert.equal(instead.body.version, 2);
      assert.equal(instead.body.source, "CATALOG");

      await submit("ravi", kestrel);
      clock.advance(3 * HOUR_MS + MINUTE_MS);
      await review(kestrel, {
        version: 1,
        decision: "REJECTED",
        feedback: "Take one of ours",
      });
      const afterRejection = await pick("ravi", kestrel, offered.id);
      assert.equal(
        afterRejection.status,
        200,
        JSON.stringify(afterRejection.body),
      );
      assert.equal(afterRejection.body.status, "APPROVED");

      const tooLate = await pick("priya", latecomer, offered.id);
      assert.equal(tooLate.status, 409);
      assert.equal(tooLate.body.code, "IDEA_SUBMISSION_CLOSED");
    });

    it("only offers a cycle's own ideas, and freezes the list when the cycle closes", async () => {
      const cycleId = await openCycle();
      const otherCycle = await openCycle({ title: "Other cycle" });
      const foreign = await offer(otherCycle, "Somewhere else");
      const falcon = await team(cycleId, "aman", []);
      const wrong = await pick("aman", falcon, foreign.id);
      assert.equal(wrong.status, 404);
      assert.equal(wrong.body.code, "CATALOG_IDEA_NOT_FOUND");
      // The database agrees: a pick must come from the team's own cycle.
      await assert.rejects(
        app.prisma.$executeRaw`
          INSERT INTO "ProjectIdea" ("id", "teamId", "cycleId", "title", "problem", "status", "source", "catalogIdeaId", "submittedById", "submittedAt", "updatedAt")
          VALUES (gen_random_uuid(), ${falcon}, ${cycleId}, 'T', 'P', 'APPROVED', 'CATALOG', ${foreign.id}, ${ids.aman}, now(), now())`,
        /ProjectIdea_catalogIdeaId_cycleId_fkey/,
      );
      await owner.post(`/course-cycles/${cycleId}/close`);
      const closed = await owner.post<CatalogBody>(
        `/course-cycles/${cycleId}/idea-catalog`,
        { body: { title: "Late", description: "D" } },
      );
      assert.equal(closed.status, 409);
      assert.equal(closed.body.code, "CATALOG_CLOSED");
    });
  });

  describe("database guarantees", () => {
    it("one idea per team, feedback on every rejection, ideas due after teams settle", async () => {
      const cycleId = await openCycle();
      const teamId = await team(cycleId, "aman", []);
      const idea = await submit("aman", teamId);
      await assert.rejects(
        app.prisma.$executeRaw`
          INSERT INTO "ProjectIdea" ("id", "teamId", "cycleId", "title", "problem", "solution", "submittedById", "submittedAt", "updatedAt")
          VALUES (gen_random_uuid(), ${teamId}, ${cycleId}, 'Again', 'P', 'S', ${ids.aman}, now(), now())`,
        /ProjectIdea_teamId_cycleId_key/,
      );
      await assert.rejects(
        app.prisma.$executeRaw`
          INSERT INTO "IdeaReview" ("id", "ideaId", "version", "decision", "feedback", "reviewerId")
          VALUES (gen_random_uuid(), ${idea.body.id}, 1, 'REJECTED', '  ', ${ids.aman})`,
        /IdeaReview_feedback_check/,
      );
      await assert.rejects(
        app.prisma.$executeRaw`
          UPDATE "CourseProjectCycle" SET "ideaDeadline" = "teamDeadline" - interval '1 minute' WHERE "id" = ${cycleId}`,
        /CourseProjectCycle_team_idea_deadline_check/,
      );
      // A proposal needs a solution; a pick must be approved and name its catalog idea.
      for (const change of [
        app.prisma
          .$executeRaw`UPDATE "ProjectIdea" SET "solution" = NULL WHERE "id" = ${idea.body.id}`,
        app.prisma
          .$executeRaw`UPDATE "ProjectIdea" SET "source" = 'CATALOG' WHERE "id" = ${idea.body.id}`,
      ]) {
        await assert.rejects(change, /ProjectIdea_source_check/);
      }
    });
  });

  describe("where ideas come from (Phase 8)", () => {
    it("takes only proposals, only picks, or both, as the faculty chose", async () => {
      const proposalsOnly = await openCycle({
        ideaSource: "STUDENT_PROPOSALS",
      });
      const listOnly = await (async () => {
        // A list-only project needs its list before it can be published.
        const created = await owner.post("/course-cycles", {
          body: {
            courseName: "Software Design",
            title: "From the list",
            batchYear: 2026,
            semester: 7,
            academicYear: "2026-27",
            teamDeadline: at(HOUR_MS),
            ideaDeadline: at(3 * HOUR_MS),
            ideaSource: "FACULTY_LIST",
            milestones: [milestone("Final", at(DAY_MS), at(30 * DAY_MS))],
          },
        });
        const cycleId = String(created.body.id);
        await owner.post(`/course-cycles/${cycleId}/idea-catalog`, {
          body: {
            title: "Seat finder",
            description: "Free library seats",
            link: null,
          },
        });
        assert.equal(
          (await owner.post(`/course-cycles/${cycleId}/publish`)).status,
          200,
        );
        return cycleId;
      })();

      const proposer = await team(proposalsOnly, "aman", []);
      assert.equal((await submit("aman", proposer)).status, 200);
      const noList = await owner.post(
        `/course-cycles/${proposalsOnly}/idea-catalog`,
        {
          body: { title: "Seat finder", description: "Free seats", link: null },
        },
      );
      assert.equal(noList.status, 409);
      assert.equal(noList.body.code, "CATALOG_NOT_ALLOWED");

      const picker = await team(listOnly, "neha", []);
      const refused = await submit("neha", picker);
      assert.equal(refused.status, 409);
      assert.equal(refused.body.code, "PROPOSALS_NOT_ALLOWED");
      const [offered] = (
        await owner.get<{ id: string }[]>(
          `/course-cycles/${listOnly}/idea-catalog`,
        )
      ).body;
      assert.equal((await pick("neha", picker, offered.id)).status, 200);
    });

    it("checks a proposal's links against the project's idea requirement", async () => {
      const cycleId = await openCycle({
        ideaLinkRequirement: { required: ["DRIVE"], optional: [] },
      });
      const teamId = await team(cycleId, "aman", []);
      const missing = await submit("aman", teamId, { ...content, links: [] });
      assert.equal(missing.body.code, "MISSING_REQUIRED_LINK");
      const github = await submit("aman", teamId, content);
      assert.equal(github.body.code, "LINK_NOT_ALLOWED");
      const drive = await submit("aman", teamId, {
        ...content,
        links: [
          { type: "DRIVE", url: "https://docs.google.com/document/d/brief" },
        ],
      });
      assert.equal(drive.status, 200, JSON.stringify(drive.body));
    });
  });
});
