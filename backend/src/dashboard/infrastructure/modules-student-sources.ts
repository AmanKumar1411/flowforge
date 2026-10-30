import { Injectable } from "@nestjs/common";
import { CourseCycleService } from "../../course-cycles/application/course-cycle.service";
import type {
  CycleView,
  StudentEvent,
} from "../../course-cycles/application/cycle-views";
import { EvaluationService } from "../../evaluations/application/evaluation.service";
import type { MemberEvaluationView } from "../../evaluations/application/evaluation-views";
import { IdeaService } from "../../ideas/application/idea.service";
import { SubmissionService } from "../../submissions/application/submission.service";
import { TeamQueryService } from "../../teams/application/team-query.service";
import {
  DashboardActor,
  DashboardIdea,
  DashboardTeam,
  StudentSources,
} from "../application/ports/student-sources";

/** Reads every source through its module's exported service, so their rules apply unchanged. */
@Injectable()
export class ModulesStudentSources extends StudentSources {
  constructor(
    private readonly cycles: CourseCycleService,
    private readonly teams: TeamQueryService,
    private readonly ideas: IdeaService,
    private readonly submissions: SubmissionService,
    private readonly evaluations: EvaluationService,
  ) {
    super();
  }

  activeCycles(actor: DashboardActor): Promise<CycleView[]> {
    return this.cycles.listVisible(actor);
  }

  pastCycles(actor: DashboardActor): Promise<CycleView[]> {
    return this.cycles.listPastForStudent(actor);
  }

  upcomingEvents(actor: DashboardActor): Promise<StudentEvent[]> {
    return this.cycles.upcomingFor(actor);
  }

  async myTeams(actor: DashboardActor): Promise<DashboardTeam[]> {
    return (await this.teams.listMine(actor)).map((team) => ({
      id: team.id,
      cycleId: team.cycleId,
      name: team.name,
      leaderId: team.leaderId,
      members: team.members.map((member) => ({
        userId: member.userId,
        addedAt: member.addedAt,
      })),
    }));
  }

  async ideasOf(teamIds: readonly string[]): Promise<DashboardIdea[]> {
    return (await this.ideas.listForOwnTeams(teamIds)).map((idea) => ({
      teamId: idea.teamId,
      status: idea.status,
      reviews: idea.reviews.map((review) => ({
        version: review.version,
        decision: review.decision,
        reviewedAt: review.reviewedAt,
      })),
    }));
  }

  submittedMilestones(
    teamIds: readonly string[],
  ): Promise<{ teamId: string; milestoneId: string }[]> {
    return this.submissions.submittedMilestones(teamIds);
  }

  releasedResults(
    userId: string,
    teamIds: readonly string[],
  ): Promise<MemberEvaluationView[]> {
    return this.evaluations.releasedForMember(userId, teamIds);
  }
}
