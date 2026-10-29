import { Injectable } from "@nestjs/common";
import { CourseCycleService } from "../../course-cycles/application/course-cycle.service";
import { CycleEnrollmentService } from "../../course-cycles/application/cycle-enrollment.service";
import { CycleRoster } from "../../course-cycles/domain/cycle-roster";
import { TeamCycles } from "../application/ports/team-cycles";
import { TeamActor } from "../domain/team-access.policy";
import { TeamCycle } from "../domain/team";

/** Reads cycles through the course-cycles module's services, so its visibility and roster rules apply unchanged. */
@Injectable()
export class CourseCycleTeamCycles extends TeamCycles {
  constructor(
    private readonly cycles: CourseCycleService,
    private readonly enrollments: CycleEnrollmentService,
  ) {
    super();
  }

  getVisible(actor: TeamActor, cycleId: string): Promise<TeamCycle> {
    return this.cycles.getVisibleCycle(actor, cycleId);
  }

  getById(cycleId: string): Promise<TeamCycle> {
    return this.cycles.getById(cycleId);
  }

  rosterOf(cycle: TeamCycle): Promise<CycleRoster> {
    return this.enrollments.rosterOf(cycle);
  }

  notSignedIn(cycle: TeamCycle): Promise<string[]> {
    return this.enrollments.notSignedIn(cycle);
  }
}
