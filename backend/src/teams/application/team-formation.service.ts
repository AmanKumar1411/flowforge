import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { Clock } from "../../common/clock";
import { Transaction, TransactionRunner } from "../../common/transaction";
import { TeamAccessPolicy, TeamActor } from "../domain/team-access.policy";
import { TeamDomainError } from "../domain/team.errors";
import { TeamRules } from "../domain/team-rules";
import { Team, TeamCycle } from "../domain/team";
import { StudentDirectory } from "./ports/student-directory";
import { TeamCycles } from "./ports/team-cycles";
import { TeamRepository } from "./ports/team.repository";

export interface CreateTeamInput {
  name: string;
  /** The other members; the caller becomes the leader. */
  memberIds: readonly string[];
}

export interface UpdateTeamInput {
  name?: string;
  /** The complete list of other members after the change. */
  memberIds?: readonly string[];
}

/**
 * Team formation use cases. The leader adds members directly (no invitations)
 * and may change or disband the team until the cycle's formation deadline.
 * Every change runs in one transaction with its audit row.
 */
@Injectable()
export class TeamFormationService {
  constructor(
    private readonly teams: TeamRepository,
    private readonly cycles: TeamCycles,
    private readonly directory: StudentDirectory,
    private readonly rules: TeamRules,
    private readonly policy: TeamAccessPolicy,
    private readonly audit: AuditService,
    private readonly transactions: TransactionRunner,
    private readonly clock: Clock,
  ) {}

  async create(
    actor: TeamActor,
    cycleId: string,
    input: CreateTeamInput,
  ): Promise<Team> {
    const cycle = await this.cycles.getVisible(actor, cycleId);
    this.rules.assertFormationOpen(cycle, this.clock.now());
    const others = this.rules.otherMembers(actor.id, input.memberIds);
    this.rules.assertSize(others.length + 1, cycle);
    return this.transactions.run(async (tx) => {
      // The caller passed the role guard and can see the cycle, so only the others need the eligibility check.
      const users = await this.assertEligible(cycle, others, tx);
      const memberships = await this.teams.findMemberships(
        cycle.id,
        [actor.id, ...others],
        tx,
      );
      if (memberships.some((membership) => membership.userId === actor.id)) {
        throw new TeamDomainError(
          "STUDENT_ALREADY_IN_TEAM",
          "You are already in a team for this cycle",
        );
      }
      this.rules.assertAvailable(memberships, users, null);
      const team = await this.teams.create(
        {
          cycleId,
          name: input.name.trim(),
          leaderId: actor.id,
          memberIds: others,
        },
        tx,
      );
      await this.audit.record(tx, {
        action: "TEAM_CREATED",
        actorId: actor.id,
        entityType: "Team",
        entityId: team.id,
        metadata: { cycleId, memberIds: others },
      });
      return team;
    });
  }

  async update(
    actor: TeamActor,
    teamId: string,
    input: UpdateTeamInput,
  ): Promise<Team> {
    const cycle = await this.cycleForLeader(actor, teamId);
    return this.transactions.run(async (tx) => {
      const team = await this.lock(teamId, tx);
      const name = input.name?.trim();
      const renamed = name !== undefined && name !== team.name;
      const plan = input.memberIds
        ? this.rules.planMembers(team, input.memberIds)
        : { size: team.members.length, added: [], removed: [] };
      if (input.memberIds) this.rules.assertSize(plan.size, cycle);
      if (plan.added.length > 0) {
        const users = await this.assertEligible(cycle, plan.added, tx);
        this.rules.assertAvailable(
          await this.teams.findMemberships(cycle.id, plan.added, tx),
          users,
          team.id,
        );
      }
      if (!renamed && plan.added.length === 0 && plan.removed.length === 0) {
        return team;
      }
      const updated = await this.teams.update(
        team.id,
        {
          name: renamed ? name : undefined,
          addMemberIds: plan.added,
          removeMemberIds: plan.removed,
        },
        tx,
      );
      await this.audit.record(tx, {
        action: "TEAM_UPDATED",
        actorId: actor.id,
        entityType: "Team",
        entityId: team.id,
        metadata: {
          cycleId: cycle.id,
          added: plan.added,
          removed: plan.removed,
          renamed,
        },
      });
      return updated;
    });
  }

  /** Frees every member to join another team. Only before the deadline, like any change. */
  async disband(actor: TeamActor, teamId: string): Promise<void> {
    const cycle = await this.cycleForLeader(actor, teamId);
    await this.transactions.run(async (tx) => {
      const team = await this.lock(teamId, tx);
      await this.teams.delete(team.id, tx);
      await this.audit.record(tx, {
        action: "TEAM_DISBANDED",
        actorId: actor.id,
        entityType: "Team",
        entityId: team.id,
        metadata: {
          cycleId: cycle.id,
          memberIds: team.members.map((member) => member.userId),
        },
      });
    });
  }

  /** The team's cycle, after checking the caller leads the team and formation is still open. */
  private async cycleForLeader(
    actor: TeamActor,
    teamId: string,
  ): Promise<TeamCycle> {
    const team = await this.teams.findById(teamId);
    if (!team) {
      throw new TeamDomainError("TEAM_NOT_FOUND", "Team not found");
    }
    const cycle = await this.cycles.getById(team.cycleId);
    this.policy.assertLeader(actor, team, cycle);
    this.rules.assertFormationOpen(cycle, this.clock.now());
    return cycle;
  }

  /** Re-reads the team under its row lock: a concurrent change or disband has finished by now. */
  private async lock(teamId: string, tx: Transaction): Promise<Team> {
    const team = await this.teams.findByIdForUpdate(teamId, tx);
    if (!team) {
      throw new TeamDomainError("TEAM_NOT_FOUND", "Team not found");
    }
    return team;
  }

  private async assertEligible(
    cycle: TeamCycle,
    ids: readonly string[],
    tx: Transaction,
  ) {
    const users = ids.length > 0 ? await this.directory.findByIds(ids, tx) : [];
    this.rules.assertEligible(cycle, ids, users);
    return users;
  }
}
