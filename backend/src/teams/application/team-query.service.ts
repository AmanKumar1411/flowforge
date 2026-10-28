import { Injectable } from "@nestjs/common";
import { Clock } from "../../common/clock";
import { TeamAccessPolicy, TeamActor } from "../domain/team-access.policy";
import { TeamDomainError } from "../domain/team.errors";
import { TeamRules } from "../domain/team-rules";
import { Team, TeamCandidate, TeamCycle, TeamSeeker } from "../domain/team";
import { StudentDirectory } from "./ports/student-directory";
import { TeamCycles } from "./ports/team-cycles";
import { TeamSeekerRepository } from "./ports/team-seeker.repository";
import { TeamRepository } from "./ports/team.repository";

export const CANDIDATE_LIMIT = 20;

/** Read-only team use cases. Visibility follows TeamAccessPolicy and the cycle's own rules. */
@Injectable()
export class TeamQueryService {
  constructor(
    private readonly teams: TeamRepository,
    private readonly seekers: TeamSeekerRepository,
    private readonly cycles: TeamCycles,
    private readonly directory: StudentDirectory,
    private readonly rules: TeamRules,
    private readonly policy: TeamAccessPolicy,
    private readonly clock: Clock,
  ) {}

  /** Students see only their own team; the owning faculty and admins see every team. */
  async listForCycle(actor: TeamActor, cycleId: string): Promise<Team[]> {
    const cycle = await this.cycles.getVisible(actor, cycleId);
    if (actor.role === "STUDENT") {
      const own = await this.teams.findByMember(cycle.id, actor.id);
      return own ? [own] : [];
    }
    return this.teams.listByCycle(cycle.id);
  }

  async findById(actor: TeamActor, teamId: string): Promise<Team> {
    const team = await this.teams.findById(teamId);
    if (!team) {
      throw new TeamDomainError("TEAM_NOT_FOUND", "Team not found");
    }
    this.policy.assertCanRead(
      actor,
      team,
      await this.cycles.getById(team.cycleId),
    );
    return team;
  }

  /** Every team the student belongs to, across cycles: a student added by a leader sees it here at once. */
  listMine(actor: TeamActor): Promise<Team[]> {
    return this.teams.listByMember(actor.id);
  }

  /**
   * Fellow participants the caller could add, with whether each is free and
   * looking for a team. Only while formation is open: the search exists to
   * form teams, not to browse people.
   */
  async searchCandidates(
    actor: TeamActor,
    cycleId: string,
    query: string,
  ): Promise<TeamCandidate[]> {
    const cycle = await this.openCycleFor(actor, cycleId);
    const found = (
      await this.directory.search(
        await this.cycles.rosterOf(cycle),
        query.trim(),
        CANDIDATE_LIMIT + 1,
      )
    )
      .filter((user) => user.id !== actor.id)
      .slice(0, CANDIDATE_LIMIT);
    const memberships = await this.teams.findMemberships(cycle.id, [
      actor.id,
      ...found.map((user) => user.id),
    ]);
    const teamOf = new Map(
      memberships.map((membership) => [membership.userId, membership.teamId]),
    );
    const ownTeam = teamOf.get(actor.id);
    const seeking = await this.seekingIn(cycle.id);
    return found.map((user) => {
      const teamId = teamOf.get(user.id);
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        availability:
          teamId === undefined
            ? "AVAILABLE"
            : teamId === ownTeam
              ? "IN_YOUR_TEAM"
              : "IN_ANOTHER_TEAM",
        lookingForTeam: teamId === undefined && seeking.has(user.id),
        note:
          teamId === undefined ? (seeking.get(user.id)?.note ?? null) : null,
        signedIn: user.lastLoginAt !== null,
      };
    });
  }

  /** Participants without a team who switched on "Looking for a team", the caller included. */
  async listSeekers(
    actor: TeamActor,
    cycleId: string,
  ): Promise<TeamCandidate[]> {
    const cycle = await this.openCycleFor(actor, cycleId);
    const seeking = await this.seekingIn(cycle.id);
    const roster = await this.cycles.rosterOf(cycle);
    const users = (await this.directory.findByIds([...seeking.keys()])).filter(
      (user) => roster.includes(user),
    );
    const placed = new Set(
      (
        await this.teams.findMemberships(
          cycle.id,
          users.map((user) => user.id),
        )
      ).map((membership) => membership.userId),
    );
    return users
      .filter((user) => !placed.has(user.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        availability: "AVAILABLE",
        lookingForTeam: true,
        note: seeking.get(user.id)?.note ?? null,
        signedIn: user.lastLoginAt !== null,
      }));
  }

  private async openCycleFor(
    actor: TeamActor,
    cycleId: string,
  ): Promise<TeamCycle> {
    const cycle = await this.cycles.getVisible(actor, cycleId);
    this.rules.assertFormationOpen(cycle, this.clock.now());
    return cycle;
  }

  private async seekingIn(cycleId: string): Promise<Map<string, TeamSeeker>> {
    return new Map(
      (await this.seekers.list(cycleId)).map((seeker) => [
        seeker.userId,
        seeker,
      ]),
    );
  }
}
