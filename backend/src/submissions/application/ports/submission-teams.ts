import { TeamActor } from "../../../teams/domain/team-access.policy";
import {
  SubmissionCycle,
  SubmissionIdea,
  SubmissionTeam,
} from "../../domain/submission";

/** A team with its idea, as the submission rules need them. */
export interface TeamWithIdea {
  team: SubmissionTeam;
  idea: SubmissionIdea | null;
}

/** Teams, cycles and ideas, read through their modules so their visibility rules apply. */
export abstract class SubmissionTeams {
  /** The team, its cycle (with milestones) and its idea if the actor may see the team; TEAM_NOT_FOUND otherwise. */
  abstract getVisible(
    actor: TeamActor,
    teamId: string,
  ): Promise<TeamWithIdea & { cycle: SubmissionCycle }>;
  /** The team and its cycle (with milestones) if the actor may see the team, without its idea. */
  abstract getVisibleTeam(
    actor: TeamActor,
    teamId: string,
  ): Promise<{ team: SubmissionTeam; cycle: SubmissionCycle }>;
  /** A cycle the actor may see; CYCLE_NOT_FOUND otherwise. */
  abstract getVisibleCycle(
    actor: TeamActor,
    cycleId: string,
  ): Promise<SubmissionCycle>;
  /** A cycle the actor may see, and every team of it the actor may see, with its idea. */
  abstract listForCycle(
    actor: TeamActor,
    cycleId: string,
  ): Promise<{ cycle: SubmissionCycle; rows: TeamWithIdea[] }>;
}
