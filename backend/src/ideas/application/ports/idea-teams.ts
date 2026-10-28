import { TeamActor } from "../../../teams/domain/team-access.policy";
import { IdeaCycle, IdeaTeam } from "../../domain/idea";

/** Teams and cycles as the idea rules need them, read through their own modules' rules. */
export abstract class IdeaTeams {
  /** The team and its cycle if the actor may see the team; TEAM_NOT_FOUND otherwise. */
  abstract getVisible(
    actor: TeamActor,
    teamId: string,
  ): Promise<{ team: IdeaTeam; cycle: IdeaCycle }>;
  /** A cycle the actor may see; CYCLE_NOT_FOUND otherwise. */
  abstract getVisibleCycle(
    actor: TeamActor,
    cycleId: string,
  ): Promise<IdeaCycle>;
  /** A cycle the actor may see, and every team of it the actor may see. */
  abstract listForCycle(
    actor: TeamActor,
    cycleId: string,
  ): Promise<{ cycle: IdeaCycle; teams: IdeaTeam[] }>;
}
