import { AuditEvent } from "../../audit/domain/audit-event";
import { FixedClock } from "../../common/testing/fixed-clock";
import { CourseCycleService } from "../../course-cycles/application/course-cycle.service";
import {
  actor,
  admin,
  createTeamKit,
  COMPLETION_DEADLINE,
  FORMATION_DEADLINE,
  NOW,
  otherFaculty,
  owner,
  student,
} from "../testing/team-test-kit";
import { TeamFormationService } from "./team-formation.service";
import { TeamQueryService } from "./team-query.service";

// Jest cannot load NestJS 12's ES modules on Node 22; stub the decorators the classes use.
// Nested DTOs use class-transformer's @Type, which needs reflect-metadata at load time.
jest.mock("class-transformer", () => ({ Type: () => () => undefined }));
jest.mock("@nestjs/common", () => ({
  Injectable: () => (target: unknown) => target,
}));
jest.mock("@nestjs/swagger", () => ({
  ApiProperty: () => () => undefined,
  ApiPropertyOptional: () => () => undefined,
}));

const aman = student("aman");
const neha = student("neha");
const ravi = student("ravi");
const priya = student("priya");
const kiran = student("kiran");
const older = student("older", { batchYear: 2025 });
const gone = student("gone", { status: "DEACTIVATED" });

describe("Team services", () => {
  let clock: FixedClock;
  let cycles: CourseCycleService;
  let audited: AuditEvent[];
  let formation: TeamFormationService;
  let queries: TeamQueryService;
  let cycleId: string;

  beforeEach(async () => {
    const kit = createTeamKit();
    kit.directory.add(aman, neha, ravi, priya, kiran, older, gone);
    ({ clock, cycles, audited, formation, queries } = kit);
    cycleId = await publishedCycle({ minTeamSize: 2, maxTeamSize: 3 });
  });

  async function publishedCycle(
    rules: { minTeamSize: number; maxTeamSize: number },
    batchYear = 2026,
  ): Promise<string> {
    const created = await cycles.create(owner, {
      courseName: "Software Design",
      title: "Projects",
      batchYear,
      semester: 7,
      academicYear: "2026-27",
      teamDeadline: FORMATION_DEADLINE,
      // Phase 8: the cycle needs a milestone to publish; it opens at the idea deadline.
      ideaDeadline: COMPLETION_DEADLINE,
      milestones: [
        {
          name: "Final",
          submissionOpensAt: COMPLETION_DEADLINE,
          submissionDueAt: "2026-12-01T17:00:00.000Z",
          evaluationAt: "2026-12-01T17:00:00.000Z",
        },
      ],
      ...rules,
    });
    await cycles.publish(owner, created.id);
    return created.id;
  }

  const memberIds = (team: { members: { userId: string }[] }) =>
    team.members.map((member) => member.userId).sort();

  describe("forming a team", () => {
    it("makes the caller the leader and adds the chosen members without an invitation", async () => {
      const team = await formation.create(actor(aman), cycleId, {
        name: "  Falcon ",
        memberIds: [neha.id],
      });

      expect(team.name).toBe("Falcon");
      expect(team.leaderId).toBe(aman.id);
      expect(memberIds(team)).toEqual([aman.id, neha.id]);
      // Neha did nothing, yet she already sees the team.
      expect((await queries.listMine(actor(neha))).map((t) => t.id)).toEqual([
        team.id,
      ]);
      expect(audited).toEqual([
        {
          action: "TEAM_CREATED",
          actorId: aman.id,
          entityType: "Team",
          entityId: team.id,
          metadata: { cycleId, memberIds: [neha.id], origin: "STUDENT" },
        },
      ]);
    });

    it("counts the leader toward the cycle's size range", async () => {
      await expect(
        formation.create(actor(aman), cycleId, { name: "Solo", memberIds: [] }),
      ).rejects.toMatchObject({ code: "TEAM_SIZE_OUT_OF_RANGE" });
      await expect(
        formation.create(actor(aman), cycleId, {
          name: "Crowd",
          memberIds: [neha.id, ravi.id, priya.id],
        }),
      ).rejects.toMatchObject({ code: "TEAM_SIZE_OUT_OF_RANGE" });
      // Listing yourself or someone twice does not inflate the count.
      await expect(
        formation.create(actor(aman), cycleId, {
          name: "Padded",
          memberIds: [aman.id, neha.id, neha.id],
        }),
      ).resolves.toMatchObject({ leaderId: aman.id });
    });

    it.each([
      ["a student of another batch", older.id],
      ["a deactivated student", gone.id],
      ["a faculty member", "owner"],
      ["an unknown id", "00000000-0000-4000-8000-000000000000"],
    ])("refuses %s", async (_label, id) => {
      await expect(
        formation.create(actor(aman), cycleId, {
          name: "Falcon",
          memberIds: [id],
        }),
      ).rejects.toMatchObject({ code: "INELIGIBLE_TEAM_MEMBER" });
      expect(audited).toEqual([]);
    });

    it("keeps every student in at most one team per cycle", async () => {
      await formation.create(actor(aman), cycleId, {
        name: "Falcon",
        memberIds: [neha.id],
      });

      await expect(
        formation.create(actor(ravi), cycleId, {
          name: "Hawk",
          memberIds: [neha.id],
        }),
      ).rejects.toThrow("Already in another team for this cycle: Neha");
      await expect(
        formation.create(actor(neha), cycleId, {
          name: "Own team",
          memberIds: [ravi.id],
        }),
      ).rejects.toThrow("You are already in a team for this cycle");
    });

    it("lets a student be in one team in each of two cycles", async () => {
      const second = await publishedCycle({ minTeamSize: 2, maxTeamSize: 2 });
      await formation.create(actor(aman), cycleId, {
        name: "Falcon",
        memberIds: [neha.id],
      });
      await formation.create(actor(neha), second, {
        name: "Second",
        memberIds: [aman.id],
      });
      expect(await queries.listMine(actor(aman))).toHaveLength(2);
    });

    it("hides another batch's cycle entirely", async () => {
      await expect(
        formation.create(actor(older), cycleId, {
          name: "Intruders",
          memberIds: [],
        }),
      ).rejects.toMatchObject({ code: "CYCLE_NOT_FOUND" });
    });
  });

  describe("changing a team", () => {
    let teamId: string;
    beforeEach(async () => {
      teamId = (
        await formation.create(actor(aman), cycleId, {
          name: "Falcon",
          memberIds: [neha.id, ravi.id],
        })
      ).id;
      audited.length = 0;
    });

    it("lets only the leader change it", async () => {
      await expect(
        formation.update(actor(neha), teamId, { name: "Mine now" }),
      ).rejects.toMatchObject({ code: "NOT_TEAM_LEADER" });
      await expect(
        formation.update(actor(priya), teamId, { name: "Mine now" }),
      ).rejects.toMatchObject({ code: "TEAM_NOT_FOUND" });
      await expect(
        formation.disband(actor(neha), teamId),
      ).rejects.toMatchObject({ code: "NOT_TEAM_LEADER" });
    });

    it("replaces the members; removed students lose the team, added ones see it", async () => {
      const updated = await formation.update(actor(aman), teamId, {
        memberIds: [neha.id, priya.id],
      });

      expect(memberIds(updated)).toEqual([aman.id, neha.id, priya.id].sort());
      expect(await queries.listMine(actor(ravi))).toEqual([]);
      await expect(queries.findById(actor(ravi), teamId)).rejects.toMatchObject(
        { code: "TEAM_NOT_FOUND" },
      );
      expect(await queries.listMine(actor(priya))).toHaveLength(1);
      expect(audited).toEqual([
        expect.objectContaining({
          action: "TEAM_UPDATED",
          metadata: {
            cycleId,
            added: [priya.id],
            removed: [ravi.id],
            renamed: false,
          },
        }),
      ]);
    });

    it("keeps the leader: leadership cannot be dropped or transferred", async () => {
      const updated = await formation.update(actor(aman), teamId, {
        memberIds: [neha.id],
      });
      expect(updated.leaderId).toBe(aman.id);
      expect(memberIds(updated)).toEqual([aman.id, neha.id]);
    });

    it("enforces the size range on every change", async () => {
      await expect(
        formation.update(actor(aman), teamId, { memberIds: [] }),
      ).rejects.toMatchObject({ code: "TEAM_SIZE_OUT_OF_RANGE" });
      await expect(
        formation.update(actor(aman), teamId, {
          memberIds: [neha.id, ravi.id, priya.id],
        }),
      ).rejects.toMatchObject({ code: "TEAM_SIZE_OUT_OF_RANGE" });
    });

    it("refuses to add a student who is in another team", async () => {
      await formation.create(actor(priya), cycleId, {
        name: "Hawk",
        memberIds: [kiran.id],
      });
      await expect(
        formation.update(actor(aman), teamId, {
          memberIds: [neha.id, kiran.id],
        }),
      ).rejects.toThrow("Already in another team for this cycle: Kiran");
    });

    it("renames, and records nothing when nothing changes", async () => {
      const same = await formation.update(actor(aman), teamId, {
        name: "Falcon",
        memberIds: [ravi.id, neha.id],
      });
      expect(same.name).toBe("Falcon");
      expect(audited).toEqual([]);

      const renamed = await formation.update(actor(aman), teamId, {
        name: "Peregrine",
      });
      expect(renamed.name).toBe("Peregrine");
      expect(audited).toEqual([
        expect.objectContaining({
          action: "TEAM_UPDATED",
          metadata: { cycleId, added: [], removed: [], renamed: true },
        }),
      ]);
    });

    it("disbands the team and frees every member", async () => {
      await formation.disband(actor(aman), teamId);

      expect(await queries.listMine(actor(neha))).toEqual([]);
      expect(audited).toEqual([
        expect.objectContaining({
          action: "TEAM_DISBANDED",
          entityId: teamId,
          metadata: {
            cycleId,
            memberIds: expect.arrayContaining([aman.id, neha.id, ravi.id]),
          },
        }),
      ]);
      await expect(
        formation.create(actor(neha), cycleId, {
          name: "Fresh start",
          memberIds: [ravi.id],
        }),
      ).resolves.toMatchObject({ leaderId: neha.id });
    });

    it("fixes the team at the formation deadline", async () => {
      clock.advance(
        new Date(FORMATION_DEADLINE).getTime() - new Date(NOW).getTime(),
      );
      for (const attempt of [
        () => formation.update(actor(aman), teamId, { name: "Late" }),
        () => formation.disband(actor(aman), teamId),
        () =>
          formation.create(actor(priya), cycleId, {
            name: "Late",
            memberIds: [kiran.id],
          }),
        () => queries.searchCandidates(actor(priya), cycleId, "ki"),
      ]) {
        await expect(attempt()).rejects.toMatchObject({
          code: "TEAM_FORMATION_CLOSED",
        });
      }
      // Reading is still allowed.
      expect(await queries.findById(actor(neha), teamId)).toMatchObject({
        id: teamId,
      });
    });

    it("fixes the team when the faculty closes the cycle", async () => {
      await cycles.close(owner, cycleId);
      await expect(
        formation.update(actor(aman), teamId, { name: "Closed" }),
      ).rejects.toMatchObject({ code: "TEAM_FORMATION_CLOSED" });
    });

    it("keeps formation open longer when the faculty extends the deadline in time", async () => {
      await cycles.update(owner, cycleId, {
        teamDeadline: "2026-10-31T12:00:00.000Z",
      });
      clock.advance(4 * 24 * 60 * 60 * 1000 - 60_000); // 2026-10-31T08:59
      await expect(
        formation.update(actor(aman), teamId, { name: "Extended" }),
      ).resolves.toMatchObject({ name: "Extended" });
    });
  });

  describe("reading teams", () => {
    let teamId: string;
    beforeEach(async () => {
      teamId = (
        await formation.create(actor(aman), cycleId, {
          name: "Falcon",
          memberIds: [neha.id],
        })
      ).id;
      await formation.create(actor(ravi), cycleId, {
        name: "Hawk",
        memberIds: [priya.id],
      });
    });

    it("shows a student only their own team", async () => {
      expect(
        (await queries.listForCycle(actor(neha), cycleId)).map((t) => t.id),
      ).toEqual([teamId]);
      expect(await queries.listForCycle(actor(kiran), cycleId)).toEqual([]);
    });

    it("shows the owning faculty and admins every team", async () => {
      expect(await queries.listForCycle(owner, cycleId)).toHaveLength(2);
      expect(await queries.listForCycle(admin, cycleId)).toHaveLength(2);
      expect(await queries.findById(owner, teamId)).toMatchObject({
        id: teamId,
      });
    });

    it("hides the cycle and its teams from other faculty", async () => {
      await expect(
        queries.listForCycle(otherFaculty, cycleId),
      ).rejects.toMatchObject({ code: "CYCLE_NOT_FOUND" });
      await expect(
        queries.findById(otherFaculty, teamId),
      ).rejects.toMatchObject({ code: "TEAM_NOT_FOUND" });
    });
  });

  describe("searching for teammates", () => {
    beforeEach(async () => {
      await formation.create(actor(ravi), cycleId, {
        name: "Hawk",
        memberIds: [priya.id],
      });
      await formation.create(actor(aman), cycleId, {
        name: "Falcon",
        memberIds: [neha.id],
      });
    });

    it("marks each batch-mate as available, in your team or in another team", async () => {
      const found = await queries.searchCandidates(actor(aman), cycleId, "i");
      expect(
        Object.fromEntries(found.map((c) => [c.name, c.availability])),
      ).toEqual({
        Kiran: "AVAILABLE",
        Priya: "IN_ANOTHER_TEAM",
        Ravi: "IN_ANOTHER_TEAM",
      });
      expect(
        (await queries.searchCandidates(actor(aman), cycleId, "neha"))[0],
      ).toMatchObject({ name: "Neha", availability: "IN_YOUR_TEAM" });
    });

    it("matches the start of an email and never returns the caller", async () => {
      expect(
        (await queries.searchCandidates(actor(aman), cycleId, "kiran.k26")).map(
          (c) => c.id,
        ),
      ).toEqual([kiran.id]);
      expect(
        await queries.searchCandidates(actor(aman), cycleId, "aman"),
      ).toEqual([]);
    });

    it("finds only active students of the cycle's batch", async () => {
      expect(
        await queries.searchCandidates(actor(aman), cycleId, "older"),
      ).toEqual([]);
      expect(
        await queries.searchCandidates(actor(aman), cycleId, "gone"),
      ).toEqual([]);
    });
  });
});
