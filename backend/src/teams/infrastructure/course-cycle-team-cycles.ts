import { Injectable } from "@nestjs/common";
import { CourseCycleService } from "../../course-cycles/course-cycle.service";
import { TeamCycles } from "../application/ports/team-cycles";
import { TeamActor } from "../domain/team-access.policy";
import { TeamCycle } from "../domain/team";

/** Reads cycles through the course-cycles module's service, so its visibility rules apply unchanged. */
@Injectable()
export class CourseCycleTeamCycles extends TeamCycles {
  constructor(private readonly cycles: CourseCycleService) {
    super();
  }

  getVisible(actor: TeamActor, cycleId: string): Promise<TeamCycle> {
    return this.cycles.getVisibleCycle(actor, cycleId);
  }

  getById(cycleId: string): Promise<TeamCycle> {
    return this.cycles.getById(cycleId);
  }
}
