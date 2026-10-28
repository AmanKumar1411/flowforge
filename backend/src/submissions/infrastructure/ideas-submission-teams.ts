import { Injectable } from "@nestjs/common";
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

/** Reads teams, cycles and ideas through `IdeaService`, so who may see what stays decided there. */
@Injectable()
export class IdeasSubmissionTeams extends SubmissionTeams {
  constructor(private readonly ideas: IdeaService) {
    super();
  }

  async getVisible(
    actor: TeamActor,
    teamId: string,
  ): Promise<TeamWithIdea & { cycle: SubmissionCycle }> {
    const { team, cycle, idea } = await this.ideas.getTeamIdea(actor, teamId);
    return { team, cycle, idea: toSubmissionIdea(idea) };
  }

  async listForCycle(
    actor: TeamActor,
    cycleId: string,
  ): Promise<TeamWithIdea[]> {
    return (await this.ideas.listForCycle(actor, cycleId)).map(
      ({ team, idea }) => ({ team, idea: toSubmissionIdea(idea) }),
    );
  }
}
