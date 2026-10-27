import { Injectable } from "@nestjs/common";
import { Clock } from "../../common/clock";
import { TeamAccessPolicy, TeamActor } from "../domain/team-access.policy";
import { TeamDomainError } from "../domain/team.errors";
import { TeamRules } from "../domain/team-rules";
import { Team, TeamCandidate } from "../domain/team";
import { StudentDirectory } from "./ports/student-directory";
import { TeamCycles } from "./ports/team-cycles";
import { TeamRepository } from "./ports/team.repository";

export const CANDIDATE_LIMIT = 20;

/** Read-only team use cases. Visibility follows TeamAccessPolicy and the cycle's own rules. */
@Injectable()
export class TeamQueryService {
  constructor(
    private readonly teams: TeamRepository,
    private readonly cycles: TeamCycles,
    private readonly directory: StudentDirectory,
    private readonly rules: TeamRules,
    private readonly policy: TeamAccessPolicy,
    private readonly clock: Clock,
  ) {}

  /** Students see only their own team; the owning faculty and admins see every team. */
  async listForCycle(actor: TeamActor, cycleId: string): Promise<Team[]> {
    const cycle = await this.cycles.getVisible(actor, cycleId);
    if (actor.role === "STUDENT") {
      const own = await this.teams.findByMember(cycle.id, actor.id);
      return own ? [own] : [];
    }
    return this.teams.listByCycle(cycle.id);
  }

  async findById(actor: TeamActor, teamId: string): Promise<Team> {
    const team = await this.teams.findById(teamId);
    if (!team) {
      throw new TeamDomainError("TEAM_NOT_FOUND", "Team not found");
    }
    this.policy.assertCanRead(
      actor,
      team,
      await this.cycles.getById(team.cycleId),
    );
    return team;
  }

  /** Every team the student belongs to, across cycles: a student added by a leader sees it here at once. */
  listMine(actor: TeamActor): Promise<Team[]> {
    return this.teams.listByMember(actor.id);
  }

  /**
   * Batch-mates the caller could add, with whether each is free. Only while
   * formation is open: the search exists to form teams, not to browse people.
   */
  async searchCandidates(
    actor: TeamActor,
    cycleId: string,
    query: string,
  ): Promise<TeamCandidate[]> {
    const cycle = await this.cycles.getVisible(actor, cycleId);
    this.rules.assertFormationOpen(cycle, this.clock.now());
    const found = (
      await this.directory.searchStudents(
        cycle.batchYear,
        query.trim(),
        CANDIDATE_LIMIT + 1,
      )
    )
      .filter((user) => user.id !== actor.id)
      .slice(0, CANDIDATE_LIMIT);
    const memberships = await this.teams.findMemberships(cycle.id, [
      actor.id,
      ...found.map((user) => user.id),
    ]);
    const teamOf = new Map(
      memberships.map((membership) => [membership.userId, membership.teamId]),
    );
    const ownTeam = teamOf.get(actor.id);
    return found.map((user) => {
      const teamId = teamOf.get(user.id);
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        availability:
          teamId === undefined
            ? "AVAILABLE"
            : teamId === ownTeam
              ? "IN_YOUR_TEAM"
              : "IN_ANOTHER_TEAM",
      };
    });
  }
}
