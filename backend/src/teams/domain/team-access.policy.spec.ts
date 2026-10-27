import type { Role } from "../../auth/domain/role";
import { TeamAccessPolicy, TeamActor } from "./team-access.policy";
import { TeamDomainError } from "./team.errors";
import { Team, TeamCycle } from "./team";

const policy = new TeamAccessPolicy();

const cycle: TeamCycle = {
  id: "cycle",
  status: "PUBLISHED",
  kind: "CORE",
  batchYear: 2026,
  createdByFacultyId: "owner",
  minTeamSize: 1,
  maxTeamSize: 4,
  teamFormationDeadline: new Date("2026-11-01T12:00:00.000Z"),
  teamCompletionDeadline: new Date("2026-11-05T12:00:00.000Z"),
};

const team: Team = {
  id: "team",
  cycleId: "cycle",
  name: "Falcon",
  leaderId: "leader",
  origin: "STUDENT",
  members: ["leader", "member"].map((userId) => ({
    userId,
    name: userId,
    email: `${userId}@x`,
    addedById: "leader",
    addedAt: new Date(),
  })),
  createdAt: new Date(),
  updatedAt: new Date(),
};

const actor = (id: string, role: Role): TeamActor => ({
  id,
  role,
  batchYear: role === "STUDENT" ? 2026 : null,
  email: `${id}@nst.rishihood.edu.in`,
});

const codeOf = (work: () => void): string | undefined => {
  try {
    work();
    return undefined;
  } catch (error) {
    return (error as TeamDomainError).code;
  }
};

describe("TeamAccessPolicy", () => {
  it.each([
    ["the leader", actor("leader", "STUDENT"), true],
    ["a member", actor("member", "STUDENT"), true],
    ["a batch-mate outside the team", actor("outsider", "STUDENT"), false],
    ["the owning faculty", actor("owner", "FACULTY"), true],
    ["another faculty", actor("other", "FACULTY"), false],
    ["an admin", actor("admin", "ADMIN"), true],
    ["pending staff", actor("pending", "PENDING_STAFF"), false],
  ])("read access for %s is %s", (_label, who, expected) => {
    expect(policy.canRead(who, team, cycle)).toBe(expected);
  });

  it("hides a team from admins while its cycle is a draft", () => {
    expect(
      policy.canRead(actor("admin", "ADMIN"), team, {
        ...cycle,
        status: "DRAFT",
      }),
    ).toBe(false);
  });

  it("reports an unreadable team as not found", () => {
    expect(
      codeOf(() =>
        policy.assertCanRead(actor("outsider", "STUDENT"), team, cycle),
      ),
    ).toBe("TEAM_NOT_FOUND");
  });

  it("lets only the leader change the team", () => {
    expect(() =>
      policy.assertLeader(actor("leader", "STUDENT"), team, cycle),
    ).not.toThrow();
    expect(
      codeOf(() =>
        policy.assertLeader(actor("member", "STUDENT"), team, cycle),
      ),
    ).toBe("NOT_TEAM_LEADER");
    // Faculty can read the team but are not its leader.
    expect(
      codeOf(() => policy.assertLeader(actor("owner", "FACULTY"), team, cycle)),
    ).toBe("NOT_TEAM_LEADER");
    expect(
      codeOf(() =>
        policy.assertLeader(actor("outsider", "STUDENT"), team, cycle),
      ),
    ).toBe("TEAM_NOT_FOUND");
  });

  it("lets only the owning faculty complete a team", () => {
    expect(() =>
      policy.assertCycleOwner(actor("owner", "FACULTY"), team, cycle),
    ).not.toThrow();
    for (const who of [
      actor("other", "FACULTY"),
      actor("admin", "ADMIN"),
      actor("leader", "STUDENT"),
    ]) {
      expect(codeOf(() => policy.assertCycleOwner(who, team, cycle))).toBe(
        "TEAM_NOT_FOUND",
      );
    }
  });
});
