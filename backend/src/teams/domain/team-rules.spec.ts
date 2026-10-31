import { CycleRoster } from "../../course-cycles/domain/cycle-roster";
import { TeamDomainError } from "./team.errors";
import { TeamRules } from "./team-rules";
import { DirectoryUser, ProposedTeam, Team, TeamCycle } from "./team";

const rules = new TeamRules();
const DEADLINE = new Date("2026-11-01T12:00:00.000Z");
// Phase 8 (A1): the faculty place students until the idea deadline (was a completion deadline).
const IDEAS = new Date("2026-11-05T12:00:00.000Z");
const batch2026 = CycleRoster.wholeBatch(2026);

const cycle = (overrides: Partial<TeamCycle> = {}): TeamCycle => ({
  id: "cycle",
  status: "PUBLISHED",
  kind: "CORE",
  batchYear: 2026,
  createdByFacultyId: "faculty",
  minTeamSize: 2,
  maxTeamSize: 4,
  teamDeadline: DEADLINE,
  ideaDeadline: IDEAS,
  ...overrides,
});

const user = (
  id: string,
  overrides: Partial<DirectoryUser> = {},
): DirectoryUser => ({
  id,
  name: `Student ${id}`,
  email: `${id}@nst.rishihood.edu.in`,
  role: "STUDENT",
  status: "ACTIVE",
  batchYear: 2026,
  lastLoginAt: new Date("2026-10-20T09:00:00.000Z"),
  ...overrides,
});

const team = (leaderId: string, otherIds: string[]): Team => ({
  id: "team",
  cycleId: "cycle",
  name: "Falcon",
  leaderId,
  origin: "STUDENT",
  members: [leaderId, ...otherIds].map((userId) => ({
    userId,
    name: userId,
    email: `${userId}@x`,
    addedById: leaderId,
    addedAt: new Date(),
  })),
  createdAt: new Date(),
  updatedAt: new Date(),
});

const codeOf = (work: () => void): string | undefined => {
  try {
    work();
    return undefined;
  } catch (error) {
    expect(error).toBeInstanceOf(TeamDomainError);
    return (error as TeamDomainError).code;
  }
};

describe("TeamRules", () => {
  describe("formation window", () => {
    it("is open in a published cycle before the deadline", () => {
      expect(
        rules.isFormationOpen(cycle(), new Date(DEADLINE.getTime() - 1)),
      ).toBe(true);
    });

    it("closes exactly at the deadline", () => {
      expect(rules.isFormationOpen(cycle(), DEADLINE)).toBe(false);
      expect(codeOf(() => rules.assertFormationOpen(cycle(), DEADLINE))).toBe(
        "TEAM_FORMATION_CLOSED",
      );
    });

    it.each(["DRAFT", "CLOSED"] as const)(
      "is closed in a %s cycle even before the deadline",
      (status) => {
        expect(
          rules.isFormationOpen(
            cycle({ status }),
            new Date("2026-10-01T00:00:00.000Z"),
          ),
        ).toBe(false);
      },
    );
  });

  describe("size, leader included", () => {
    it.each([2, 3, 4])("accepts %i members in a 2 to 4 cycle", (size) => {
      expect(() => rules.assertSize(size, cycle())).not.toThrow();
    });

    it.each([1, 5])("refuses %i members in a 2 to 4 cycle", (size) => {
      expect(codeOf(() => rules.assertSize(size, cycle()))).toBe(
        "TEAM_SIZE_OUT_OF_RANGE",
      );
    });

    it("explains a fixed size in the message", () => {
      expect(() =>
        rules.assertSize(2, cycle({ minTeamSize: 3, maxTeamSize: 3 })),
      ).toThrow(
        /exactly 3 members including the leader; this one would have 2/,
      );
    });

    it("allows a solo team when the minimum is 1", () => {
      expect(() =>
        rules.assertSize(1, cycle({ minTeamSize: 1 })),
      ).not.toThrow();
    });
  });

  describe("member lists", () => {
    it("drops the leader and duplicates from the requested members", () => {
      expect(rules.otherMembers("lead", ["a", "lead", "b", "a"])).toEqual([
        "a",
        "b",
      ]);
    });

    it("plans additions and removals against the current team", () => {
      expect(rules.planMembers(team("lead", ["a", "b"]), ["b", "c"])).toEqual({
        size: 3,
        added: ["c"],
        removed: ["a"],
      });
    });

    it("never plans to remove the leader, even when the list leaves them out", () => {
      const plan = rules.planMembers(team("lead", ["a"]), []);
      expect(plan).toEqual({ size: 1, added: [], removed: ["a"] });
    });
  });

  describe("eligibility", () => {
    it("accepts active students of the cycle's batch", () => {
      expect(() =>
        rules.assertEligible(batch2026, ["a", "b"], [user("a"), user("b")]),
      ).not.toThrow();
    });

    it.each([
      ["another batch", user("x", { batchYear: 2025 })],
      ["no batch", user("x", { batchYear: null })],
      ["faculty", user("x", { role: "FACULTY", batchYear: null })],
      ["admin", user("x", { role: "ADMIN", batchYear: null })],
      ["pending staff", user("x", { role: "PENDING_STAFF", batchYear: null })],
      ["deactivated", user("x", { status: "DEACTIVATED" })],
    ])("refuses %s", (_label, candidate) => {
      expect(
        codeOf(() => rules.assertEligible(batch2026, ["x"], [candidate])),
      ).toBe("INELIGIBLE_TEAM_MEMBER");
    });

    it("refuses an id that matches nobody, without saying so differently", () => {
      expect(() => rules.assertEligible(batch2026, ["ghost"], [])).toThrow(
        "1 selected person is not an active student of batch 2026",
      );
    });

    it("follows an elective's roster instead of the batch", () => {
      const roster = CycleRoster.enrolled(["a@nst.rishihood.edu.in"]);
      expect(() =>
        // Batch does not matter for an elective: the roster decides.
        rules.assertEligible(roster, ["a"], [user("a", { batchYear: 2025 })]),
      ).not.toThrow();
      expect(() => rules.assertEligible(roster, ["b"], [user("b")])).toThrow(
        "1 selected person is not an active student enrolled in this elective",
      );
    });
  });

  describe("faculty placement window (A1)", () => {
    const before = new Date(DEADLINE.getTime() - 1);
    const end = IDEAS;

    it("opens exactly at the team deadline and closes at the idea deadline", () => {
      expect(rules.isPlacementOpen(cycle(), before)).toBe(false);
      expect(rules.isPlacementOpen(cycle(), DEADLINE)).toBe(true);
      expect(rules.isPlacementOpen(cycle(), new Date(end.getTime() - 1))).toBe(
        true,
      );
      expect(rules.isPlacementOpen(cycle(), end)).toBe(false);
    });

    it("never overlaps the students' window", () => {
      for (const now of [before, DEADLINE, end]) {
        expect(
          rules.isFormationOpen(cycle(), now) &&
            rules.isPlacementOpen(cycle(), now),
        ).toBe(false);
      }
    });

    it("says why it is closed", () => {
      expect(() => rules.assertPlacementOpen(cycle(), before)).toThrow(
        /Students are still forming their own teams/,
      );
      expect(() => rules.assertPlacementOpen(cycle(), end)).toThrow(
        "The time to place students ended at the idea deadline",
      );
      expect(
        codeOf(() =>
          rules.assertPlacementOpen(cycle({ status: "CLOSED" }), DEADLINE),
        ),
      ).toBe("TEAM_COMPLETION_CLOSED");
    });
  });

  describe("faculty placements", () => {
    it("adds to a team only while it has room", () => {
      expect(() =>
        rules.assertHasRoom(team("lead", ["a", "b"]), cycle()),
      ).not.toThrow();
      expect(() =>
        rules.assertHasRoom(team("lead", ["a", "b", "c"]), cycle()),
      ).toThrow(
        expect.objectContaining({
          code: "TEAM_FULL",
          message: "Falcon already has the maximum of 4 members",
        }),
      );
    });

    it("refuses a student in two proposed teams, leaders included", () => {
      const proposal = (
        leaderId: string,
        memberIds: string[],
      ): ProposedTeam => ({
        name: "T",
        leaderId,
        memberIds,
      });
      expect(() =>
        rules.assertNoOverlap([proposal("a", ["b"]), proposal("c", ["d"])]),
      ).not.toThrow();
      expect(
        codeOf(() =>
          rules.assertNoOverlap([proposal("a", ["b"]), proposal("b", ["c"])]),
        ),
      ).toBe("DUPLICATE_TEAM_MEMBER");
    });
  });

  describe("one team per student per cycle", () => {
    const users = [user("a"), user("b")];

    it("passes when nobody is in a team", () => {
      expect(() => rules.assertAvailable([], users, null)).not.toThrow();
    });

    it("names the students who are in another team", () => {
      expect(() =>
        rules.assertAvailable(
          [
            { userId: "a", teamId: "other" },
            { userId: "b", teamId: "other" },
          ],
          users,
          null,
        ),
      ).toThrow("Already in another team for this cycle: Student a, Student b");
    });

    it("ignores memberships of the team being edited", () => {
      expect(() =>
        rules.assertAvailable([{ userId: "a", teamId: "mine" }], users, "mine"),
      ).not.toThrow();
    });
  });
});
