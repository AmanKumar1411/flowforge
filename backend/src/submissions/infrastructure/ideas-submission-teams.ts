import { Injectable } from "@nestjs/common";
import { CourseCycleService } from "../../course-cycles/application/course-cycle.service";
import { IdeaService } from "../../ideas/application/idea.service";
import { Idea } from "../../ideas/domain/idea";
import { TeamActor } from "../../teams/domain/team-access.policy";
import {
  SubmissionTeams,
  TeamWithIdea,
} from "../application/ports/submission-teams";
import { SubmissionCycle, SubmissionIdea } from "../domain/submission";

const toSubmissionIdea = (idea: Idea | null): SubmissionIdea | null =>
  idea ? { title: idea.title, status: idea.status, source: idea.source } : null;

/**
 * Reads teams and ideas through `IdeaService`, and the cycle with its
 * milestones through `CourseCycleService`, so who may see what stays decided
 * in those modules.
 */
@Injectable()
export class IdeasSubmissionTeams extends SubmissionTeams {
  constructor(
    private readonly ideas: IdeaService,
    private readonly cycles: CourseCycleService,
  ) {
    super();
  }

  async getVisible(
    actor: TeamActor,
    teamId: string,
  ): Promise<TeamWithIdea & { cycle: SubmissionCycle }> {
    const { team, idea } = await this.ideas.getTeamIdea(actor, teamId);
    return {
      team,
      cycle: await this.cycles.getById(team.cycleId),
      idea: toSubmissionIdea(idea),
    };
  }

  async listForCycle(
    actor: TeamActor,
    cycleId: string,
  ): Promise<{ cycle: SubmissionCycle; rows: TeamWithIdea[] }> {
    const cycle = await this.cycles.getVisibleCycle(actor, cycleId);
    const rows = (await this.ideas.listForCycle(actor, cycle.id)).map(
      ({ team, idea }) => ({ team, idea: toSubmissionIdea(idea) }),
    );
    return { cycle, rows };
  }
}
