import { Injectable } from "@nestjs/common";
import { CourseCycleService } from "../../course-cycles/course-cycle.service";
import { TeamQueryService } from "../../teams/application/team-query.service";
import { TeamActor } from "../../teams/domain/team-access.policy";
import { Team } from "../../teams/domain/team";
import { IdeaTeams } from "../application/ports/idea-teams";
import { IdeaCycle, IdeaTeam } from "../domain/idea";

const toIdeaTeam = (team: Team): IdeaTeam => ({
  id: team.id,
  cycleId: team.cycleId,
  name: team.name,
  leaderId: team.leaderId,
  members: team.members.map(({ userId, name }) => ({ userId, name })),
});

/** Reads teams and cycles through their modules' services, so who may see what stays decided there. */
@Injectable()
export class TeamsIdeaTeams extends IdeaTeams {
  constructor(
    private readonly teams: TeamQueryService,
    private readonly cycles: CourseCycleService,
  ) {
    super();
  }

  async getVisible(
    actor: TeamActor,
    teamId: string,
  ): Promise<{ team: IdeaTeam; cycle: IdeaCycle }> {
    const team = await this.teams.findById(actor, teamId);
    return {
      team: toIdeaTeam(team),
      cycle: await this.cycles.getById(team.cycleId),
    };
  }

  async listForCycle(
    actor: TeamActor,
    cycleId: string,
  ): Promise<{ cycle: IdeaCycle; teams: IdeaTeam[] }> {
    const cycle = await this.cycles.getVisibleCycle(actor, cycleId);
    const teams = await this.teams.listForCycle(actor, cycle.id);
    return { cycle, teams: teams.map(toIdeaTeam) };
  }
}
