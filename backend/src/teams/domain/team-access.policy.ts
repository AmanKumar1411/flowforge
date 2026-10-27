import type { Role } from "../../auth/domain/role";
import { TeamDomainError } from "./team.errors";
import { Team, TeamCycle } from "./team";

export type TeamActor = {
  id: string;
  role: Role;
  batchYear: number | null;
};

/**
 * Who may see or change a team, behind the role guard. A team the actor may
 * not see is reported as not found, so its existence is never revealed.
 */
export class TeamAccessPolicy {
  canRead(actor: TeamActor, team: Team, cycle: TeamCycle): boolean {
    switch (actor.role) {
      case "STUDENT":
        return team.members.some((member) => member.userId === actor.id);
      case "FACULTY":
        return cycle.createdByFacultyId === actor.id;
      case "ADMIN":
        return cycle.status !== "DRAFT";
      case "PENDING_STAFF":
        return false;
    }
  }

  assertCanRead(actor: TeamActor, team: Team, cycle: TeamCycle): void {
    if (!this.canRead(actor, team, cycle)) {
      throw new TeamDomainError("TEAM_NOT_FOUND", "Team not found");
    }
  }

  /** Members can see their team but only the leader changes it. Leadership never moves. */
  assertLeader(actor: TeamActor, team: Team, cycle: TeamCycle): void {
    this.assertCanRead(actor, team, cycle);
    if (team.leaderId !== actor.id) {
      throw new TeamDomainError(
        "NOT_TEAM_LEADER",
        "Only the team leader can change the team",
      );
    }
  }
}
