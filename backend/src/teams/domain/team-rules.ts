import { TeamDomainError } from "./team.errors";
import { DirectoryUser, Membership, Team, TeamCycle } from "./team";

export interface MemberPlan {
  /** Size after the change, leader included. */
  size: number;
  added: string[];
  removed: string[];
}

/**
 * The team-formation rules of a cycle, free of I/O. Sizes always count the
 * leader, and a saved team is always within the cycle's size range, so later
 * phases never meet an incomplete team.
 */
export class TeamRules {
  isFormationOpen(cycle: TeamCycle, now: Date): boolean {
    return cycle.status === "PUBLISHED" && now < cycle.teamFormationDeadline;
  }

  /** Teams change only in a published cycle, strictly before its formation deadline. */
  assertFormationOpen(cycle: TeamCycle, now: Date): void {
    if (!this.isFormationOpen(cycle, now)) {
      throw new TeamDomainError(
        "TEAM_FORMATION_CLOSED",
        "Team formation for this cycle has ended; teams can no longer change",
      );
    }
  }

  assertSize(size: number, cycle: TeamCycle): void {
    if (size < cycle.minTeamSize || size > cycle.maxTeamSize) {
      throw new TeamDomainError(
        "TEAM_SIZE_OUT_OF_RANGE",
        `A team in this cycle has ${this.describeRange(cycle)} including the leader; this one would have ${size}`,
      );
    }
  }

  /** The requested members other than the leader, without duplicates. */
  otherMembers(leaderId: string, memberIds: readonly string[]): string[] {
    return [...new Set(memberIds)].filter((id) => id !== leaderId);
  }

  /** Compares the requested members (leader excluded) with the team's current ones. */
  planMembers(team: Team, requestedIds: readonly string[]): MemberPlan {
    const requested = this.otherMembers(team.leaderId, requestedIds);
    const current = new Set(
      team.members
        .map((member) => member.userId)
        .filter((id) => id !== team.leaderId),
    );
    return {
      size: requested.length + 1,
      added: requested.filter((id) => !current.has(id)),
      removed: [...current].filter((id) => !requested.includes(id)),
    };
  }

  /** Only active students of the cycle's batch may join; unknown ids are refused the same way. */
  assertEligible(
    cycle: TeamCycle,
    requestedIds: readonly string[],
    found: readonly DirectoryUser[],
  ): void {
    const eligible = new Set(
      found
        .filter(
          (user) =>
            user.role === "STUDENT" &&
            user.status === "ACTIVE" &&
            user.batchYear === cycle.batchYear,
        )
        .map((user) => user.id),
    );
    const refused = requestedIds.filter((id) => !eligible.has(id));
    if (refused.length > 0) {
      throw new TeamDomainError(
        "INELIGIBLE_TEAM_MEMBER",
        `${refused.length} selected ${refused.length === 1 ? "person is" : "people are"} not an active student of batch ${cycle.batchYear}`,
      );
    }
  }

  /** Nobody may be in two teams of one cycle. `teamId` is the team being edited, if any. */
  assertAvailable(
    memberships: readonly Membership[],
    users: readonly Pick<DirectoryUser, "id" | "name">[],
    teamId: string | null,
  ): void {
    const taken = memberships.filter(
      (membership) => membership.teamId !== teamId,
    );
    if (taken.length === 0) return;
    const names = taken.map(
      (membership) =>
        users.find((user) => user.id === membership.userId)?.name ??
        "A selected student",
    );
    throw new TeamDomainError(
      "STUDENT_ALREADY_IN_TEAM",
      `Already in another team for this cycle: ${names.join(", ")}`,
    );
  }

  private describeRange(cycle: TeamCycle): string {
    return cycle.minTeamSize === cycle.maxTeamSize
      ? `exactly ${cycle.minTeamSize} members`
      : `${cycle.minTeamSize} to ${cycle.maxTeamSize} members`;
  }
}
