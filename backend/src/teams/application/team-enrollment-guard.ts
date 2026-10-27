import { Injectable, OnModuleInit } from "@nestjs/common";
import { EnrollmentRemovalChecks } from "../../course-cycles/enrollment-removal-checks";
import { TeamDomainError } from "../domain/team.errors";
import { TeamRepository } from "./ports/team.repository";

/**
 * Plugs into the cycles module's extension point: a student cannot leave an
 * elective's roster while they are in one of its teams.
 */
@Injectable()
export class TeamEnrollmentGuard implements OnModuleInit {
  constructor(
    private readonly checks: EnrollmentRemovalChecks,
    private readonly teams: TeamRepository,
  ) {}

  onModuleInit(): void {
    this.checks.register(async (cycleId, email, tx) => {
      if (await this.teams.findMembershipByEmail(cycleId, email, tx)) {
        throw new TeamDomainError(
          "ENROLLED_STUDENT_IN_TEAM",
          "This student is in a team of this cycle, so they cannot be removed from the elective",
        );
      }
    });
  }
}
