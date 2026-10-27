import { TeamActor } from "../../domain/team-access.policy";
import { TeamCycle } from "../../domain/team";

/** How the teams module reads cycles. The adapter delegates to the course-cycles module. */
export abstract class TeamCycles {
  /** The cycle, or CYCLE_NOT_FOUND when the actor may not see it. */
  abstract getVisible(actor: TeamActor, cycleId: string): Promise<TeamCycle>;
  /** The cycle a team belongs to, for rules that do not depend on who is asking. */
  abstract getById(cycleId: string): Promise<TeamCycle>;
}
