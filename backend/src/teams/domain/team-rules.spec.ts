import { TeamDomainError } from "./team.errors";
import { TeamRules } from "./team-rules";
import { DirectoryUser, Team, TeamCycle } from "./team";

const rules = new TeamRules();
const DEADLINE = new Date("2026-11-01T12:00:00.000Z");

const cycle = (overrides: Partial<TeamCycle> = {}): TeamCycle => ({
  id: "cycle",
  status: "PUBLISHED",
  batchYear: 2026,
  createdByFacultyId: "faculty",
  minTeamSize: 2,
  maxTeamSize: 4,
  teamFormationDeadline: DEADLINE,
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
  ...overrides,
});

const team = (leaderId: string, otherIds: string[]): Team => ({
  id: "team",
  cycleId: "cycle",
  name: "Falcon",
  leaderId,
  members: [leaderId, ...otherIds].map((userId) => ({
    userId,
    name: userId,
    email: `${userId}@x`,
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
        rules.assertEligible(cycle(), ["a", "b"], [user("a"), user("b")]),
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
        codeOf(() => rules.assertEligible(cycle(), ["x"], [candidate])),
      ).toBe("INELIGIBLE_TEAM_MEMBER");
    });

    it("refuses an id that matches nobody, without saying so differently", () => {
      expect(() => rules.assertEligible(cycle(), ["ghost"], [])).toThrow(
        "1 selected person is not an active student of batch 2026",
      );
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
