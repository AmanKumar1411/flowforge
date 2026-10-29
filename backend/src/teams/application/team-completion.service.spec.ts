import { AuditEvent } from "../../audit/domain/audit-event";
import { FixedClock } from "../../common/testing/fixed-clock";
import { CourseCycleService } from "../../course-cycles/application/course-cycle.service";
import { CycleEnrollmentService } from "../../course-cycles/application/cycle-enrollment.service";
import { DirectoryUser } from "../domain/team";
import {
  actor,
  admin,
  COMPLETION_DEADLINE,
  createTeamKit,
  FORMATION_DEADLINE,
  NOW,
  otherFaculty,
  owner,
  student,
} from "../testing/team-test-kit";
import { TeamCompletionService } from "./team-completion.service";
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

const students = ["aman", "neha", "ravi", "priya", "kiran", "dev", "isha"].map(
  (id) => student(id),
);
const [aman, neha, ravi, priya, kiran, dev, isha] = students;
const older = student("older", { batchYear: 2025 });

const untilFormationEnds =
  new Date(FORMATION_DEADLINE).getTime() - new Date(NOW).getTime();

describe("Team completion and electives", () => {
  let clock: FixedClock;
  let cycles: CourseCycleService;
  let enrollments: CycleEnrollmentService;
  let audited: AuditEvent[];
  let formation: TeamFormationService;
  let queries: TeamQueryService;
  let completion: TeamCompletionService;
  let cycleId: string;

  const createKit = (seed = 1) => {
    const kit = createTeamKit(seed);
    kit.directory.add(...students, older);
    ({ clock, cycles, enrollments, audited, formation, queries, completion } =
      kit);
  };

  async function publishedCycle(
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const created = await cycles.create(owner, {
      courseName: "Software Design",
      title: "Projects",
      batchYear: 2026,
      semester: 7,
      academicYear: "2026-27",
      minTeamSize: 2,
      maxTeamSize: 3,
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
      ...overrides,
    });
    await cycles.publish(owner, created.id);
    return created.id;
  }

  const ids = (users: DirectoryUser[]) => users.map((user) => user.id).sort();

  beforeEach(async () => {
    createKit();
    cycleId = await publishedCycle();
  });

  describe("the completion window", () => {
    it("is closed while students are still forming teams, and after the idea deadline (A1)", async () => {
      await expect(
        completion.previewAutoGroup(owner, cycleId),
      ).rejects.toMatchObject({ code: "TEAM_COMPLETION_CLOSED" });
      clock.advance(untilFormationEnds);
      expect((await completion.overview(owner, cycleId)).open).toBe(true);
      clock.advance(
        new Date(COMPLETION_DEADLINE).getTime() -
          new Date(FORMATION_DEADLINE).getTime(),
      );
      await expect(
        completion.createTeam(owner, cycleId, {
          name: "Late",
          leaderId: aman.id,
          memberIds: [neha.id],
        }),
      ).rejects.toThrow(
        "The time to place students ended at the idea deadline",
      );
    });

    it("lists who still needs a team, with their 'looking' note", async () => {
      await formation.create(actor(aman), cycleId, {
        name: "Falcon",
        memberIds: [neha.id],
      });
      await formation.startLooking(actor(ravi), cycleId, " Backend person ");
      clock.advance(untilFormationEnds);

      const overview = await completion.overview(owner, cycleId);
      expect(overview.unassigned.map((s) => s.id).sort()).toEqual(
        ids([ravi, priya, kiran, dev, isha]),
      );
      expect(overview.unassigned.find((s) => s.id === ravi.id)).toMatchObject({
        lookingForTeam: true,
        note: "Backend person",
      });
      expect(overview.notSignedIn).toEqual([]);
      // Admins may look; other faculty cannot even see the cycle.
      expect(
        (await completion.overview(admin, cycleId)).unassigned,
      ).toHaveLength(5);
      await expect(
        completion.overview(otherFaculty, cycleId),
      ).rejects.toMatchObject({ code: "CYCLE_NOT_FOUND" });
    });
  });

  describe("faculty placing students by hand", () => {
    beforeEach(async () => {
      await formation.create(actor(aman), cycleId, {
        name: "Falcon",
        memberIds: [neha.id],
      });
      clock.advance(untilFormationEnds);
      audited.length = 0;
    });

    it("creates a team with the leader the faculty chose", async () => {
      const team = await completion.createTeam(owner, cycleId, {
        name: " Kestrel ",
        leaderId: ravi.id,
        memberIds: [priya.id],
      });
      expect(team).toMatchObject({
        name: "Kestrel",
        leaderId: ravi.id,
        origin: "FACULTY",
      });
      expect(team.members.every((m) => m.addedById === owner.id)).toBe(true);
      // The student sees the team without doing anything.
      expect(await queries.listMine(actor(priya))).toHaveLength(1);
      expect(audited).toEqual([
        expect.objectContaining({
          action: "TEAM_CREATED",
          actorId: owner.id,
          metadata: {
            cycleId,
            leaderId: ravi.id,
            memberIds: [priya.id],
            origin: "FACULTY",
          },
        }),
      ]);
    });

    it("keeps the size range and refuses students already in a team", async () => {
      await expect(
        completion.createTeam(owner, cycleId, {
          name: "Solo",
          leaderId: ravi.id,
          memberIds: [],
        }),
      ).rejects.toMatchObject({ code: "TEAM_SIZE_OUT_OF_RANGE" });
      await expect(
        completion.createTeam(owner, cycleId, {
          name: "Poach",
          leaderId: ravi.id,
          memberIds: [neha.id],
        }),
      ).rejects.toThrow("Already in another team for this cycle: Neha");
      await expect(
        completion.createTeam(owner, cycleId, {
          name: "Other batch",
          leaderId: ravi.id,
          memberIds: [older.id],
        }),
      ).rejects.toMatchObject({ code: "INELIGIBLE_TEAM_MEMBER" });
    });

    it("adds a student to a team with room, and refuses a full team", async () => {
      const [falcon] = await queries.listForCycle(owner, cycleId);
      const grown = await completion.addMember(owner, falcon.id, ravi.id);
      expect(grown.members.map((m) => m.userId).sort()).toEqual(
        ids([aman, neha, ravi]),
      );
      expect(grown.members.find((m) => m.userId === ravi.id)?.addedById).toBe(
        owner.id,
      );
      await expect(
        completion.addMember(owner, falcon.id, priya.id),
      ).rejects.toThrow("Falcon already has the maximum of 3 members");
    });

    it("is only for the cycle's own faculty", async () => {
      const [falcon] = await queries.listForCycle(owner, cycleId);
      await expect(
        completion.addMember(otherFaculty, falcon.id, ravi.id),
      ).rejects.toMatchObject({ code: "TEAM_NOT_FOUND" });
      await expect(
        completion.createTeam(otherFaculty, cycleId, {
          name: "Nope",
          leaderId: ravi.id,
          memberIds: [priya.id],
        }),
      ).rejects.toMatchObject({ code: "CYCLE_NOT_FOUND" });
    });

    it("does not let students change teams in the faculty's window", async () => {
      await expect(
        formation.create(actor(ravi), cycleId, {
          name: "Late",
          memberIds: [priya.id],
        }),
      ).rejects.toMatchObject({ code: "TEAM_FORMATION_CLOSED" });
    });
  });

  describe("auto-grouping", () => {
    beforeEach(async () => {
      await formation.create(actor(aman), cycleId, {
        name: "Falcon",
        memberIds: [neha.id],
      });
      clock.advance(untilFormationEnds);
      audited.length = 0;
    });

    it("previews random teams for everyone without one, within the size range, saving nothing", async () => {
      const preview = await completion.previewAutoGroup(owner, cycleId);
      // 5 students without a team, sizes 2 to 3: one team of 3 and one of 2.
      expect(
        preview.teams.map((team) => team.members.length + 1).sort(),
      ).toEqual([2, 3]);
      expect(
        preview.teams
          .flatMap((team) => [team.leader, ...team.members])
          .map((p) => p.id)
          .sort(),
      ).toEqual(ids([ravi, priya, kiran, dev, isha]));
      expect(preview.teams.map((team) => team.name)).toEqual([
        "Auto team 1",
        "Auto team 2",
      ]);
      expect(preview.unplaced).toEqual([]);
      expect(await queries.listForCycle(owner, cycleId)).toHaveLength(1);
      expect(audited).toEqual([]);
    });

    it("re-rolls: another preview can group differently", async () => {
      const groupings = new Set<string>();
      for (let roll = 0; roll < 10; roll += 1) {
        const preview = await completion.previewAutoGroup(owner, cycleId);
        groupings.add(
          JSON.stringify(
            preview.teams.map((team) => [
              team.leader.id,
              ...team.members.map((m) => m.id),
            ]),
          ),
        );
      }
      expect(groupings.size).toBeGreaterThan(1);
    });

    it("creates the confirmed teams and records one summary", async () => {
      const preview = await completion.previewAutoGroup(owner, cycleId);
      const created = await completion.applyAutoGroup(
        owner,
        cycleId,
        preview.teams.map((team) => ({
          name: team.name,
          leaderId: team.leader.id,
          memberIds: team.members.map((m) => m.id),
        })),
      );
      expect(created.map((team) => team.origin)).toEqual([
        "AUTO_GROUP",
        "AUTO_GROUP",
      ]);
      expect((await completion.overview(owner, cycleId)).unassigned).toEqual(
        [],
      );
      expect(audited.map((event) => event.action)).toEqual([
        "TEAM_CREATED",
        "TEAM_CREATED",
        "AUTO_GROUP_APPLIED",
      ]);
      expect(audited[2]).toMatchObject({
        entityType: "CourseProjectCycle",
        entityId: cycleId,
        metadata: { teamIds: created.map((team) => team.id), studentCount: 5 },
      });
      expect(created.map((team) => team.name)).toEqual([
        "Auto team 1",
        "Auto team 2",
      ]);
    });

    it("refuses a proposal that lists a student twice, before creating anything", async () => {
      await expect(
        completion.applyAutoGroup(owner, cycleId, [
          { name: "A", leaderId: ravi.id, memberIds: [priya.id] },
          { name: "B", leaderId: priya.id, memberIds: [kiran.id] },
        ]),
      ).rejects.toMatchObject({ code: "DUPLICATE_TEAM_MEMBER" });
      expect(await queries.listForCycle(owner, cycleId)).toHaveLength(1);
    });

    it("reports students no valid team can take", async () => {
      // Teams of exactly 3 and 7 students without a team: two teams, one left over.
      createKit();
      const strict = await publishedCycle({ minTeamSize: 3, maxTeamSize: 3 });
      clock.advance(untilFormationEnds);
      const preview = await completion.previewAutoGroup(owner, strict);
      expect(preview.teams).toHaveLength(2);
      expect(preview.unplaced).toHaveLength(1);
    });
  });

  describe("electives", () => {
    let elective: string;

    beforeEach(async () => {
      elective = await publishedCycle({ kind: "ELECTIVE" });
    });

    it("are visible only to enrolled students, whatever their batch", async () => {
      await enrollments.add(owner, elective, [neha.email, older.email]);
      expect(
        (await cycles.listVisible(actor(neha))).map((c) => c.id),
      ).toContain(elective);
      expect((await cycles.listVisible(actor(older))).map((c) => c.id)).toEqual(
        [elective],
      );
      expect(
        (await cycles.listVisible(actor(ravi))).map((c) => c.id),
      ).not.toContain(elective);
      await expect(
        cycles.findById(actor(ravi), elective),
      ).rejects.toMatchObject({ code: "CYCLE_NOT_FOUND" });
    });

    it("import valid student emails and report the rest", async () => {
      const result = await enrollments.add(owner, elective, [
        ` ${neha.email.toUpperCase()} `,
        neha.email,
        "prakriti.p@nst.rishihood.edu.in",
        "someone@gmail.com",
        "not an email",
      ]);
      expect(result).toEqual({
        added: [neha.email],
        alreadyEnrolled: [],
        rejected: [
          {
            email: "prakriti.p@nst.rishihood.edu.in",
            reason: "A staff email, not a student",
          },
          {
            email: "someone@gmail.com",
            reason: "Not a student email of this university",
          },
          {
            email: "not an email",
            reason: "Not a student email of this university",
          },
        ],
      });
      expect(
        (await enrollments.add(owner, elective, [neha.email])).alreadyEnrolled,
      ).toEqual([neha.email]);
    });

    it("register students who have not signed in yet, so the faculty can place them", async () => {
      await enrollments.add(owner, elective, [
        neha.email,
        "new.s26csai@nst.rishihood.edu.in",
      ]);
      expect(await enrollments.list(owner, elective)).toEqual([
        expect.objectContaining({
          email: neha.email,
          name: "Neha",
          signedIn: true,
        }),
        expect.objectContaining({
          email: "new.s26csai@nst.rishihood.edu.in",
          name: "New S",
          signedIn: false,
        }),
      ]);
      clock.advance(untilFormationEnds);
      const overview = await completion.overview(owner, elective);
      expect(overview.notSignedIn).toEqual([]);
      expect(overview.unassigned).toContainEqual(
        expect.objectContaining({
          email: "new.s26csai@nst.rishihood.edu.in",
          signedIn: false,
        }),
      );
    });

    it("form teams only from the roster", async () => {
      await enrollments.add(owner, elective, [aman.email, neha.email]);
      await expect(
        formation.create(actor(aman), elective, {
          name: "Pair",
          memberIds: [ravi.id],
        }),
      ).rejects.toThrow(
        "1 selected person is not an active student enrolled in this elective",
      );
      await formation.create(actor(aman), elective, {
        name: "Pair",
        memberIds: [neha.id],
      });
      expect(
        (await queries.searchCandidates(actor(aman), elective, "a")).map(
          (c) => c.id,
        ),
      ).toEqual([neha.id]);
    });

    it("never drop a student who is in a team", async () => {
      await enrollments.add(owner, elective, [
        aman.email,
        neha.email,
        ravi.email,
      ]);
      await formation.create(actor(aman), elective, {
        name: "Pair",
        memberIds: [neha.id],
      });
      await expect(
        enrollments.remove(owner, elective, neha.email),
      ).rejects.toMatchObject({ code: "ENROLLED_STUDENT_IN_TEAM" });
      await enrollments.remove(owner, elective, ravi.email);
      await expect(
        enrollments.remove(owner, elective, ravi.email),
      ).rejects.toMatchObject({ code: "ENROLLMENT_NOT_FOUND" });
    });

    it("exist only for electives, managed by their own faculty", async () => {
      await expect(
        enrollments.add(owner, cycleId, [neha.email]),
      ).rejects.toMatchObject({ code: "CYCLE_NOT_ELECTIVE" });
      await expect(
        enrollments.add(otherFaculty, elective, [neha.email]),
      ).rejects.toMatchObject({ code: "CYCLE_NOT_FOUND" });
    });
  });

  describe("looking for a team", () => {
    it("is shown to batch-mates and cleared when the student joins a team", async () => {
      await formation.startLooking(actor(ravi), cycleId, "Frontend");
      expect(
        (await queries.listSeekers(actor(aman), cycleId)).map((s) => [
          s.name,
          s.note,
        ]),
      ).toEqual([["Ravi", "Frontend"]]);
      expect(
        (await queries.searchCandidates(actor(aman), cycleId, "ravi"))[0],
      ).toMatchObject({ lookingForTeam: true, note: "Frontend" });

      await formation.create(actor(aman), cycleId, {
        name: "Falcon",
        memberIds: [ravi.id],
      });
      expect(await queries.listSeekers(actor(aman), cycleId)).toEqual([]);
    });

    it("needs a student without a team, while formation is open", async () => {
      await formation.create(actor(aman), cycleId, {
        name: "Falcon",
        memberIds: [neha.id],
      });
      await expect(
        formation.startLooking(actor(neha), cycleId, null),
      ).rejects.toMatchObject({ code: "STUDENT_ALREADY_IN_TEAM" });
      clock.advance(untilFormationEnds);
      await expect(
        formation.startLooking(actor(ravi), cycleId, null),
      ).rejects.toMatchObject({ code: "TEAM_FORMATION_CLOSED" });
    });

    it("can be switched off", async () => {
      await formation.startLooking(actor(ravi), cycleId, null);
      await formation.stopLooking(actor(ravi), cycleId);
      expect(await queries.listSeekers(actor(aman), cycleId)).toEqual([]);
    });
  });
});
