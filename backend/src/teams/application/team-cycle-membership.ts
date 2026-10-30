import { Injectable, OnModuleInit } from "@nestjs/common";
import { CycleMembership } from "../../course-cycles/application/cycle-membership";
import { TeamRepository } from "./ports/team.repository";

/**
 * Plugs into the cycles module's extension point: a student who was in a
 * team of a cycle can still read it once it is closed (S4, ADR 022).
 */
@Injectable()
export class TeamCycleMembership implements OnModuleInit {
  constructor(
    private readonly membership: CycleMembership,
    private readonly teams: TeamRepository,
  ) {}

  onModuleInit(): void {
    this.membership.provide(async (userId) =>
      (await this.teams.listByMember(userId)).map((team) => team.cycleId),
    );
  }
}
