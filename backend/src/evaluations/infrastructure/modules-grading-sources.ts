import { Injectable } from "@nestjs/common";
import { CourseCycleService } from "../../course-cycles/application/course-cycle.service";
import { SubmissionService } from "../../submissions/application/submission.service";
import { TeamQueryService } from "../../teams/application/team-query.service";
import { Team } from "../../teams/domain/team";
import {
  GradingSources,
  LatestWork,
} from "../application/ports/grading-sources";
import {
  EvaluationActor,
  GradingCycle,
  GradingTeam,
} from "../domain/evaluation";

type Actor = EvaluationActor & { batchYear: number | null; email: string };

const toGradingTeam = (team: Team): GradingTeam => ({
  id: team.id,
  cycleId: team.cycleId,
  name: team.name,
  memberIds: team.members.map((member) => member.userId),
});

/** Reads cycles, teams and submissions through their modules' exported services, so their visibility rules apply. */
@Injectable()
export class ModulesGradingSources extends GradingSources {
  constructor(
    private readonly cycles: CourseCycleService,
    private readonly teams: TeamQueryService,
    private readonly submissions: SubmissionService,
  ) {
    super();
  }

  visibleCycle(actor: Actor, cycleId: string): Promise<GradingCycle> {
    return this.cycles.getVisibleCycle(actor, cycleId);
  }

  async teamsOf(actor: Actor, cycleId: string): Promise<GradingTeam[]> {
    return (await this.teams.listForCycle(actor, cycleId)).map(toGradingTeam);
  }

  async team(actor: Actor, teamId: string): Promise<GradingTeam> {
    return toGradingTeam(await this.teams.findById(actor, teamId));
  }

  latestWork(
    actor: Actor,
    cycleId: string,
    milestoneId: string,
  ): Promise<LatestWork[]> {
    return this.submissions.latestForCycle(actor, cycleId, milestoneId);
  }
}
