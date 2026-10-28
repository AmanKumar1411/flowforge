import { AuditService } from "../../audit/audit.service";
import { AuditEvent } from "../../audit/domain/audit-event";
import { FixedClock } from "../../common/testing/fixed-clock";
import { ImmediateTransactionRunner } from "../../common/testing/immediate-transaction.runner";
import { Transaction } from "../../common/transaction";
import { TeamActor } from "../../teams/domain/team-access.policy";
import { IdeaCycle, IdeaTeam } from "../domain/idea";
import { IdeaDomainError } from "../domain/idea.errors";
import { IdeaRules } from "../domain/idea-rules";
import { InMemoryIdeaCatalogRepository } from "../testing/in-memory-idea-catalog.repository";
import { InMemoryIdeaRepository } from "../testing/in-memory-idea.repository";
import { IdeaCatalogService } from "./idea-catalog.service";
import { IdeaService } from "./idea.service";
import { IdeaTeams } from "./ports/idea-teams";

// Jest cannot load NestJS 12's ES modules on Node 22; stub the decorator the service uses.
jest.mock("@nestjs/common", () => ({
  Injectable: () => (target: unknown) => target,
}));

const HOUR_MS = 60 * 60 * 1000;
const NOW = "2026-11-05T09:00:00.000Z";
// The idea deadline is 4 days away; submissions open a day after it and close a month later.
const cycle: IdeaCycle = {
  id: "cycle",
  status: "PUBLISHED",
  createdByFacultyId: "faculty",
  ideaDeadline: new Date("2026-11-09T09:00:00.000Z"),
  submissionStartAt: new Date("2026-11-10T09:00:00.000Z"),
  submissionDeadline: new Date("2026-12-10T09:00:00.000Z"),
};

const person = (id: string, role: TeamActor["role"]): TeamActor => ({
  id,
  role,
  batchYear: role === "STUDENT" ? 2026 : null,
  email: `${id}@nst.rishihood.edu.in`,
});
const leader = person("leader", "STUDENT");
const member = person("member", "STUDENT");
const outsider = person("outsider", "STUDENT");
const faculty = person("faculty", "FACULTY");
const otherFaculty = person("other-faculty", "FACULTY");
const admin = person("admin", "ADMIN");

const falcon: IdeaTeam = {
  id: "falcon",
  cycleId: "cycle",
  name: "Falcon",
  leaderId: "leader",
  members: [
    { userId: "leader", name: "Leader" },
    { userId: "member", name: "Member" },
  ],
};
const kestrel: IdeaTeam = {
  id: "kestrel",
  cycleId: "cycle",
  name: "Kestrel",
  leaderId: "other-leader",
  members: [{ userId: "other-leader", name: "Other leader" }],
};

const content = {
  title: "Lost and found",
  problem: "Things get lost on campus",
  solution: "A board with photos",
  link: null,
};

/** Members see their team; the owning faculty and admins see every team; nobody else does. */
class FakeIdeaTeams extends IdeaTeams {
  readonly teams = new Map([falcon, kestrel].map((team) => [team.id, team]));
  readonly cycle: IdeaCycle = { ...cycle };

  /** Other faculty do not see the cycle; everyone else in these tests does. */
  getVisibleCycle(actor: TeamActor) {
    if (actor.role === "FACULTY" && actor.id !== cycle.createdByFacultyId) {
      return Promise.reject(
        new IdeaDomainError("TEAM_NOT_FOUND", "Cycle not found"),
      );
    }
    return Promise.resolve(this.cycle);
  }

  getVisible(actor: TeamActor, teamId: string) {
    const team = this.teams.get(teamId);
    const visible =
      team &&
      (actor.role === "ADMIN" ||
        (actor.role === "FACULTY" && actor.id === cycle.createdByFacultyId) ||
        team.members.some((entry) => entry.userId === actor.id));
    if (!visible) {
      return Promise.reject(
        new IdeaDomainError("TEAM_NOT_FOUND", "Team not found"),
      );
    }
    return Promise.resolve({ team, cycle: this.cycle });
  }

  listForCycle() {
    return Promise.resolve({
      cycle: this.cycle,
      teams: [...this.teams.values()],
    });
  }
}

function createKit() {
  const clock = new FixedClock(NOW);
  const audited: AuditEvent[] = [];
  const teams = new FakeIdeaTeams();
  // Teams disbanded after the caller read them, before the transaction locked them.
  const disbanded = new Set<string>();
  const ideas = new InMemoryIdeaRepository(
    (id) => ({ id, name: id }),
    (teamId) => !disbanded.has(teamId),
  );
  const catalog = new InMemoryIdeaCatalogRepository((id) =>
    ideas.pickCount(id),
  );
  const audit = {
    record: async (_tx: Transaction, event: AuditEvent) => {
      audited.push(event);
    },
  } as unknown as AuditService;
  const service = new IdeaService(
    ideas,
    catalog,
    teams,
    new IdeaRules(),
    audit,
    new ImmediateTransactionRunner(),
    clock,
  );
  const catalogService = new IdeaCatalogService(
    catalog,
    teams,
    new IdeaRules(),
    audit,
    new ImmediateTransactionRunner(),
  );
  return { service, catalogService, teams, clock, audited, disbanded };
}

describe("IdeaService", () => {
  let kit: ReturnType<typeof createKit>;
  beforeEach(() => {
    kit = createKit();
  });

  it("lets the leader submit the first idea; members read it", async () => {
    const idea = await kit.service.submit(leader, "falcon", {
      ...content,
      title: "  Lost and found ",
      link: " ",
    });
    expect(idea).toMatchObject({
      title: "Lost and found",
      link: null,
      status: "SUBMITTED",
      version: 1,
      submittedBy: { id: "leader" },
    });
    expect(await kit.service.get(member, "falcon")).toMatchObject({
      id: idea.id,
    });
    expect(kit.audited).toEqual([
      expect.objectContaining({
        action: "IDEA_SUBMITTED",
        actorId: "leader",
        entityType: "ProjectIdea",
        metadata: { cycleId: "cycle", teamId: "falcon", version: 1 },
      }),
    ]);
  });

  it("refuses members and outsiders", async () => {
    await expect(
      kit.service.submit(member, "falcon", content),
    ).rejects.toMatchObject({
      code: "NOT_TEAM_LEADER",
    });
    await expect(kit.service.get(outsider, "falcon")).rejects.toMatchObject({
      code: "TEAM_NOT_FOUND",
    });
  });

  it("returns null before the first submission", async () => {
    expect(await kit.service.get(leader, "falcon")).toBeNull();
  });

  it("lets the leader change a waiting idea before the deadline, as a new version", async () => {
    await kit.service.submit(leader, "falcon", content);
    const changed = await kit.service.submit(leader, "falcon", {
      ...content,
      title: "Lost & found board",
    });
    expect(changed).toMatchObject({ status: "SUBMITTED", version: 2 });
    expect(kit.audited.map((event) => event.action)).toEqual([
      "IDEA_SUBMITTED",
      "IDEA_UPDATED",
    ]);
  });

  it("closes first submissions and changes at the idea deadline", async () => {
    await kit.service.submit(leader, "falcon", content);
    kit.clock.advance(4 * 24 * HOUR_MS);
    await expect(
      kit.service.submit(leader, "falcon", content),
    ).rejects.toMatchObject({
      code: "IDEA_SUBMISSION_CLOSED",
    });
    await expect(
      kit.service.submit(person("other-leader", "STUDENT"), "kestrel", content),
    ).rejects.toMatchObject({ code: "IDEA_SUBMISSION_CLOSED" });
  });

  describe("review", () => {
    beforeEach(async () => {
      await kit.service.submit(leader, "falcon", content);
      kit.audited.length = 0;
    });

    it("is for the owning faculty only", async () => {
      for (const reviewer of [otherFaculty, admin]) {
        await expect(
          kit.service.review(reviewer, "falcon", {
            version: 1,
            decision: "APPROVED",
          }),
        ).rejects.toMatchObject({ code: "TEAM_NOT_FOUND" });
      }
    });

    it("refuses a version the team has changed since", async () => {
      await kit.service.submit(leader, "falcon", { ...content, title: "New" });
      await expect(
        kit.service.review(faculty, "falcon", {
          version: 1,
          decision: "APPROVED",
        }),
      ).rejects.toMatchObject({ code: "IDEA_CHANGED" });
    });

    it("needs feedback to reject, then lets the team resubmit after the idea deadline", async () => {
      await expect(
        kit.service.review(faculty, "falcon", {
          version: 1,
          decision: "REJECTED",
        }),
      ).rejects.toMatchObject({ code: "IDEA_FEEDBACK_REQUIRED" });
      const rejected = await kit.service.review(faculty, "falcon", {
        version: 1,
        decision: "REJECTED",
        feedback: "Too broad",
      });
      expect(rejected).toMatchObject({
        status: "REJECTED",
        reviews: [
          {
            version: 1,
            decision: "REJECTED",
            feedback: "Too broad",
            reviewer: { id: "faculty" },
          },
        ],
      });

      // Past the idea deadline, a rejected idea can still be resubmitted.
      kit.clock.advance(4 * 24 * HOUR_MS + HOUR_MS);
      const resubmitted = await kit.service.submit(leader, "falcon", {
        ...content,
        title: "Lost and found for hostels",
      });
      expect(resubmitted).toMatchObject({ status: "SUBMITTED", version: 2 });
      expect(resubmitted.reviews).toHaveLength(1);

      const approved = await kit.service.review(faculty, "falcon", {
        version: 2,
        decision: "APPROVED",
      });
      expect(approved.status).toBe("APPROVED");
      expect(approved.reviews.map((review) => review.decision)).toEqual([
        "APPROVED",
        "REJECTED",
      ]);
      await expect(
        kit.service.submit(leader, "falcon", content),
      ).rejects.toMatchObject({
        code: "IDEA_ALREADY_APPROVED",
      });
      expect(kit.audited.map((event) => event.action)).toEqual([
        "IDEA_REJECTED",
        "IDEA_SUBMITTED",
        "IDEA_APPROVED",
      ]);
    });

    it("keeps the rounds going after submissions open and close, until the cycle closes", async () => {
      await kit.service.review(faculty, "falcon", {
        version: 1,
        decision: "REJECTED",
        feedback: "Too broad",
      });
      kit.clock.advance(40 * 24 * HOUR_MS);
      const second = await kit.service.submit(leader, "falcon", content);
      expect(second).toMatchObject({ status: "SUBMITTED", version: 2 });
      await kit.service.review(faculty, "falcon", {
        version: 2,
        decision: "REJECTED",
        feedback: "Still too broad",
      });
      kit.teams.cycle.status = "CLOSED";
      await expect(
        kit.service.submit(leader, "falcon", content),
      ).rejects.toMatchObject({
        code: "IDEA_RESUBMISSION_CLOSED",
      });
    });

    it("reports a team without an idea", async () => {
      await expect(
        kit.service.review(faculty, "kestrel", {
          version: 1,
          decision: "APPROVED",
        }),
      ).rejects.toMatchObject({ code: "IDEA_NOT_FOUND" });
    });
  });

  it("lists every team of the cycle, with or without an idea", async () => {
    await kit.service.submit(leader, "falcon", content);
    const rows = await kit.service.listForCycle(faculty, "cycle");
    expect(
      rows.map((row) => [row.team.name, row.idea?.status ?? null]),
    ).toEqual([
      ["Falcon", "SUBMITTED"],
      ["Kestrel", null],
    ]);
  });

  it("refuses a team that was disbanded meanwhile", async () => {
    kit.disbanded.add("falcon");
    await expect(
      kit.service.submit(leader, "falcon", content),
    ).rejects.toMatchObject({
      code: "TEAM_NOT_FOUND",
    });
  });

  describe("picking from the faculty's catalog", () => {
    const brief = {
      title: "Library seat finder",
      description: "Show free library seats",
      link: null,
    };

    it("makes the pick the team's idea, approved at once; only the leader picks", async () => {
      const offered = await kit.catalogService.add(faculty, "cycle", brief);
      await expect(
        kit.service.pick(member, "falcon", offered.id),
      ).rejects.toMatchObject({ code: "NOT_TEAM_LEADER" });
      const picked = await kit.service.pick(leader, "falcon", offered.id);
      expect(picked).toMatchObject({
        title: "Library seat finder",
        problem: "Show free library seats",
        solution: null,
        source: "CATALOG",
        catalogIdeaId: offered.id,
        status: "APPROVED",
        version: 1,
      });
      await expect(
        kit.service.submit(leader, "falcon", content),
      ).rejects.toMatchObject({ code: "IDEA_ALREADY_APPROVED" });
      expect(kit.audited.at(-1)).toMatchObject({
        action: "IDEA_PICKED",
        metadata: { teamId: "falcon", version: 1, catalogIdeaId: offered.id },
      });
    });

    it("lets any number of teams pick the same idea, and counts them", async () => {
      const offered = await kit.catalogService.add(faculty, "cycle", brief);
      await kit.service.pick(leader, "falcon", offered.id);
      await kit.service.pick(
        person("other-leader", "STUDENT"),
        "kestrel",
        offered.id,
      );
      expect(await kit.catalogService.list(leader, "cycle")).toMatchObject([
        { id: offered.id, pickCount: 2 },
      ]);
    });

    it("replaces a waiting proposal before the deadline, or a rejected one after it", async () => {
      const offered = await kit.catalogService.add(faculty, "cycle", brief);
      await kit.service.submit(leader, "falcon", content);
      const instead = await kit.service.pick(leader, "falcon", offered.id);
      expect(instead).toMatchObject({ source: "CATALOG", version: 2 });

      await kit.service.submit(
        person("other-leader", "STUDENT"),
        "kestrel",
        content,
      );
      await kit.service.review(faculty, "kestrel", {
        version: 1,
        decision: "REJECTED",
        feedback: "Pick one of ours",
      });
      kit.clock.advance(10 * 24 * HOUR_MS);
      const afterRejection = await kit.service.pick(
        person("other-leader", "STUDENT"),
        "kestrel",
        offered.id,
      );
      expect(afterRejection).toMatchObject({
        status: "APPROVED",
        version: 2,
      });
    });

    it("needs the first idea, pick or proposal, before the idea deadline", async () => {
      const offered = await kit.catalogService.add(faculty, "cycle", brief);
      kit.clock.advance(4 * 24 * HOUR_MS);
      await expect(
        kit.service.pick(leader, "falcon", offered.id),
      ).rejects.toMatchObject({ code: "IDEA_SUBMISSION_CLOSED" });
    });

    it("refuses an idea that is not in the cycle's catalog", async () => {
      await expect(
        kit.service.pick(leader, "falcon", "catalog-404"),
      ).rejects.toMatchObject({ code: "CATALOG_IDEA_NOT_FOUND" });
    });
  });

  describe("the catalog itself", () => {
    const brief = {
      title: " Library seat finder ",
      description: "Show free library seats",
      link: " ",
    };

    it("lets the owning faculty add, edit and remove ideas, each audited", async () => {
      const added = await kit.catalogService.add(faculty, "cycle", brief);
      expect(added).toMatchObject({ title: "Library seat finder", link: null });
      const edited = await kit.catalogService.update(
        faculty,
        "cycle",
        added.id,
        {
          ...brief,
          title: "Seat finder",
        },
      );
      expect(edited.title).toBe("Seat finder");
      await kit.catalogService.remove(faculty, "cycle", added.id);
      expect(await kit.catalogService.list(admin, "cycle")).toEqual([]);
      expect(kit.audited.map((event) => event.action)).toEqual([
        "CATALOG_IDEA_ADDED",
        "CATALOG_IDEA_UPDATED",
        "CATALOG_IDEA_REMOVED",
      ]);
    });

    it("keeps a picked idea; the team keeps its copy when the faculty edit it", async () => {
      const added = await kit.catalogService.add(faculty, "cycle", brief);
      await kit.service.pick(leader, "falcon", added.id);
      await expect(
        kit.catalogService.remove(faculty, "cycle", added.id),
      ).rejects.toMatchObject({ code: "CATALOG_IDEA_PICKED" });
      await kit.catalogService.update(faculty, "cycle", added.id, {
        ...brief,
        title: "Renamed",
      });
      expect((await kit.service.get(leader, "falcon"))?.title).toBe(
        "Library seat finder",
      );
    });

    it("is changed only by the owning faculty, and not once the cycle is closed", async () => {
      await expect(
        kit.catalogService.add(otherFaculty, "cycle", brief),
      ).rejects.toMatchObject({ code: "TEAM_NOT_FOUND" });
      await expect(
        kit.catalogService.add(leader, "cycle", brief),
      ).rejects.toMatchObject({ code: "CATALOG_IDEA_NOT_FOUND" });
      kit.teams.cycle.status = "CLOSED";
      await expect(
        kit.catalogService.add(faculty, "cycle", brief),
      ).rejects.toMatchObject({ code: "CATALOG_CLOSED" });
    });
  });
});
