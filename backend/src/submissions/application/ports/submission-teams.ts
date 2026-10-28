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

/** Teams, cycles and ideas, read through the ideas module so its visibility rules apply. */
export abstract class SubmissionTeams {
  /** The team, its cycle and its idea if the actor may see the team; TEAM_NOT_FOUND otherwise. */
  abstract getVisible(
    actor: TeamActor,
    teamId: string,
  ): Promise<TeamWithIdea & { cycle: SubmissionCycle }>;
  /** Every team of a cycle the actor may see, with its idea. */
  abstract listForCycle(
    actor: TeamActor,
    cycleId: string,
  ): Promise<TeamWithIdea[]>;
}
