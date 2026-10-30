import {
  EvaluationActor,
  GradingCycle,
  GradingTeam,
} from "../../domain/evaluation";

/** A team's newest version for a milestone, as the grading view shows it. */
export interface LatestWork {
  teamId: string;
  version: number;
  submittedAt: Date;
}

/** Cycles, teams and submissions as evaluations read them, through their own modules' rules. */
export abstract class GradingSources {
  /** The cycle with its milestones, or CYCLE_NOT_FOUND when the actor may not see it. */
  abstract visibleCycle(
    actor: EvaluationActor & { batchYear: number | null; email: string },
    cycleId: string,
  ): Promise<GradingCycle>;
  /** Every team of the cycle the actor may see. */
  abstract teamsOf(
    actor: EvaluationActor & { batchYear: number | null; email: string },
    cycleId: string,
  ): Promise<GradingTeam[]>;
  /** A team the actor may see; TEAM_NOT_FOUND otherwise. */
  abstract team(
    actor: EvaluationActor & { batchYear: number | null; email: string },
    teamId: string,
  ): Promise<GradingTeam>;
  /** Each team's newest version for the milestone (none for a team that submitted nothing). */
  abstract latestWork(
    actor: EvaluationActor & { batchYear: number | null; email: string },
    cycleId: string,
    milestoneId: string,
  ): Promise<LatestWork[]>;
}
