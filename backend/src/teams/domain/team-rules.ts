import { CycleRoster } from "../../course-cycles/domain/cycle-roster";
import { TeamDomainError } from "./team.errors";
import {
  DirectoryUser,
  Membership,
  ProposedTeam,
  Team,
  TeamCycle,
} from "./team";

export interface MemberPlan {
  /** Size after the change, leader included. */
  size: number;
  added: string[];
  removed: string[];
}

/**
 * The team rules of a cycle, free of I/O. Sizes always count the leader, and a
 * saved team is always within the cycle's size range, so later phases never
 * meet an incomplete team. Two windows follow each other: students form their
 * own teams until the team deadline, then the owning faculty place the
 * students left without a team until the idea deadline (A1).
 */
export class TeamRules {
  isFormationOpen(cycle: TeamCycle, now: Date): boolean {
    return cycle.status === "PUBLISHED" && now < cycle.teamDeadline;
  }

  /** The faculty's window: from the team deadline until the idea deadline. */
  isPlacementOpen(cycle: TeamCycle, now: Date): boolean {
    return (
      cycle.status === "PUBLISHED" &&
      cycle.teamDeadline <= now &&
      now < cycle.ideaDeadline
    );
  }

  /** Teams change only in a published cycle, strictly before its team deadline. */
  assertFormationOpen(cycle: TeamCycle, now: Date): void {
    if (!this.isFormationOpen(cycle, now)) {
      throw new TeamDomainError(
        "TEAM_FORMATION_CLOSED",
        "Team formation for this cycle has ended; teams can no longer change",
      );
    }
  }

  /** Faculty placement (a team by hand, a member added, auto-group): after the team deadline, before the idea deadline. */
  assertPlacementOpen(cycle: TeamCycle, now: Date): void {
    if (this.isPlacementOpen(cycle, now)) return;
    throw new TeamDomainError(
      "TEAM_COMPLETION_CLOSED",
      this.isFormationOpen(cycle, now)
        ? "Students are still forming their own teams; you can place students from the team deadline until the idea deadline"
        : "The time to place students ended at the idea deadline",
    );
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

  /**
   * A team with room for one more member. A full team is a conflict with its
   * current state (409), like losing a race for its last slot, not a bad
   * request (BUG-7, H9).
   */
  assertHasRoom(team: Team, cycle: TeamCycle): void {
    if (team.members.length >= cycle.maxTeamSize) {
      throw new TeamDomainError(
        "TEAM_FULL",
        `${team.name} already has the maximum of ${cycle.maxTeamSize} members`,
      );
    }
  }

  /** Only participants of the cycle may join: its batch, or an elective's roster. Unknown ids are refused the same way. */
  assertEligible(
    roster: CycleRoster,
    requestedIds: readonly string[],
    found: readonly DirectoryUser[],
  ): void {
    const eligible = new Set(
      found.filter((user) => roster.includes(user)).map((user) => user.id),
    );
    const refused = requestedIds.filter((id) => !eligible.has(id));
    if (refused.length > 0) {
      throw new TeamDomainError(
        "INELIGIBLE_TEAM_MEMBER",
        `${refused.length} selected ${refused.length === 1 ? "person is" : "people are"} not ${roster.describe()}`,
      );
    }
  }

  /** Every student appears once across the proposed teams, leaders included. */
  assertNoOverlap(teams: readonly ProposedTeam[]): void {
    const seen = new Set<string>();
    for (const team of teams) {
      for (const id of [team.leaderId, ...team.memberIds]) {
        if (seen.has(id)) {
          throw new TeamDomainError(
            "DUPLICATE_TEAM_MEMBER",
            "A student appears in more than one proposed team",
          );
        }
        seen.add(id);
      }
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
