import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { Clock } from "../../common/clock";
import { RandomSource } from "../../common/random";
import { Transaction, TransactionRunner } from "../../common/transaction";
import { CycleRoster } from "../../course-cycles/domain/cycle-roster";
import { TeamAccessPolicy, TeamActor } from "../domain/team-access.policy";
import { TeamAllocator } from "../domain/team-allocator";
import { TeamDomainError } from "../domain/team.errors";
import { TeamRules } from "../domain/team-rules";
import {
  DirectoryUser,
  ProposedTeam,
  Team,
  TeamCycle,
  UnassignedStudent,
} from "../domain/team";
import { StudentDirectory } from "./ports/student-directory";
import { TeamCycles } from "./ports/team-cycles";
import { TeamSeekerRepository } from "./ports/team-seeker.repository";
import { TeamRepository } from "./ports/team.repository";

export interface CompletionOverview {
  /** True between the team and idea deadlines of a published cycle. */
  open: boolean;
  unassigned: UnassignedStudent[];
  /** Enrolled emails with no account (enrolled before pre-registration): enrolling them again registers them. */
  notSignedIn: string[];
}

type Person = Pick<DirectoryUser, "id" | "name" | "email">;

export interface AutoGroupPreview {
  teams: { name: string; leader: Person; members: Person[] }[];
  unplaced: Person[];
}

/**
 * The owning faculty place students left without a team between the team
 * deadline and the idea deadline (A1): by hand (create a team, add a student to a team with room) or by random
 * auto-grouping. Auto-group is preview-then-confirm and stateless: the preview
 * is only a suggestion, and confirming re-checks every team like a manual one.
 */
@Injectable()
export class TeamCompletionService {
  private readonly allocator: TeamAllocator;

  constructor(
    private readonly teams: TeamRepository,
    private readonly seekers: TeamSeekerRepository,
    private readonly cycles: TeamCycles,
    private readonly directory: StudentDirectory,
    private readonly rules: TeamRules,
    private readonly policy: TeamAccessPolicy,
    private readonly audit: AuditService,
    private readonly transactions: TransactionRunner,
    private readonly clock: Clock,
    random: RandomSource,
  ) {
    this.allocator = new TeamAllocator(random);
  }

  /** The owning faculty, or an admin (read-only). */
  async overview(
    actor: TeamActor,
    cycleId: string,
  ): Promise<CompletionOverview> {
    const cycle = await this.cycles.getVisible(actor, cycleId);
    return {
      open: this.rules.isPlacementOpen(cycle, this.clock.now()),
      unassigned: await this.unassigned(cycle),
      notSignedIn: await this.cycles.notSignedIn(cycle),
    };
  }

  async createTeam(
    actor: TeamActor,
    cycleId: string,
    proposal: ProposedTeam,
  ): Promise<Team> {
    const cycle = await this.openCycleFor(actor, cycleId);
    const roster = await this.cycles.rosterOf(cycle);
    return this.transactions.run((tx) =>
      this.createFacultyTeam(actor, cycle, roster, proposal, "FACULTY", tx),
    );
  }

  async addMember(
    actor: TeamActor,
    teamId: string,
    userId: string,
  ): Promise<Team> {
    const found = await this.teams.findById(teamId);
    if (!found) throw new TeamDomainError("TEAM_NOT_FOUND", "Team not found");
    const cycle = await this.cycles.getById(found.cycleId);
    this.policy.assertCycleOwner(actor, found, cycle);
    this.rules.assertPlacementOpen(cycle, this.clock.now());
    const roster = await this.cycles.rosterOf(cycle);
    return this.transactions.run(async (tx) => {
      const team = await this.teams.findByIdForUpdate(teamId, tx);
      if (!team) throw new TeamDomainError("TEAM_NOT_FOUND", "Team not found");
      this.rules.assertHasRoom(team, cycle);
      await this.assertCanPlace(roster, cycle, [userId], tx);
      const updated = await this.teams.update(
        team.id,
        { addMemberIds: [userId], removeMemberIds: [], addedById: actor.id },
        tx,
      );
      await this.seekers.removeMany(cycle.id, [userId], tx);
      await this.audit.record(tx, {
        action: "TEAM_UPDATED",
        actorId: actor.id,
        entityType: "Team",
        entityId: team.id,
        metadata: {
          cycleId: cycle.id,
          added: [userId],
          removed: [],
          renamed: false,
        },
      });
      return updated;
    });
  }

  /** Random teams from everyone without a team. Nothing is saved. */
  async previewAutoGroup(
    actor: TeamActor,
    cycleId: string,
  ): Promise<AutoGroupPreview> {
    const cycle = await this.openCycleFor(actor, cycleId);
    const unassigned = await this.unassigned(cycle);
    const byId = new Map(unassigned.map((student) => [student.id, student]));
    const person = (id: string): Person => {
      const { name, email } = byId.get(id)!;
      return { id, name, email };
    };
    const allocation = this.allocator.allocate(
      unassigned.map((student) => student.id),
      cycle.minTeamSize,
      cycle.maxTeamSize,
    );
    const numbering = await this.nextAutoTeamNumber(cycle.id);
    return {
      teams: allocation.groups.map(([leaderId, ...memberIds], index) => ({
        name: `Auto team ${numbering + index}`,
        leader: person(leaderId),
        members: memberIds.map(person),
      })),
      unplaced: allocation.unplaced.map(person),
    };
  }

  /** Creates the confirmed teams all together, or none if anything changed since the preview. */
  async applyAutoGroup(
    actor: TeamActor,
    cycleId: string,
    proposals: readonly ProposedTeam[],
  ): Promise<Team[]> {
    const cycle = await this.openCycleFor(actor, cycleId);
    this.rules.assertNoOverlap(proposals);
    const roster = await this.cycles.rosterOf(cycle);
    return this.transactions.run(async (tx) => {
      const created: Team[] = [];
      for (const proposal of proposals) {
        created.push(
          await this.createFacultyTeam(
            actor,
            cycle,
            roster,
            proposal,
            "AUTO_GROUP",
            tx,
          ),
        );
      }
      await this.audit.record(tx, {
        action: "AUTO_GROUP_APPLIED",
        actorId: actor.id,
        entityType: "CourseProjectCycle",
        entityId: cycle.id,
        metadata: {
          teamIds: created.map((team) => team.id),
          studentCount: created.reduce(
            (sum, team) => sum + team.members.length,
            0,
          ),
        },
      });
      return created;
    });
  }

  private async createFacultyTeam(
    actor: TeamActor,
    cycle: TeamCycle,
    roster: CycleRoster,
    proposal: ProposedTeam,
    origin: "FACULTY" | "AUTO_GROUP",
    tx: Transaction,
  ): Promise<Team> {
    const others = this.rules.otherMembers(
      proposal.leaderId,
      proposal.memberIds,
    );
    this.rules.assertSize(others.length + 1, cycle);
    await this.assertCanPlace(
      roster,
      cycle,
      [proposal.leaderId, ...others],
      tx,
    );
    const team = await this.teams.create(
      {
        cycleId: cycle.id,
        name: proposal.name.trim(),
        leaderId: proposal.leaderId,
        memberIds: others,
        origin,
        addedById: actor.id,
      },
      tx,
    );
    await this.seekers.removeMany(cycle.id, [proposal.leaderId, ...others], tx);
    await this.audit.record(tx, {
      action: "TEAM_CREATED",
      actorId: actor.id,
      entityType: "Team",
      entityId: team.id,
      metadata: {
        cycleId: cycle.id,
        leaderId: proposal.leaderId,
        memberIds: others,
        origin,
      },
    });
    return team;
  }

  /** Participants of the cycle, and in no team of it. */
  private async assertCanPlace(
    roster: CycleRoster,
    cycle: TeamCycle,
    ids: readonly string[],
    tx: Transaction,
  ): Promise<void> {
    const users = await this.directory.findByIds(ids, tx);
    this.rules.assertEligible(roster, ids, users);
    this.rules.assertAvailable(
      await this.teams.findMemberships(cycle.id, ids, tx),
      users,
      null,
    );
  }

  private async openCycleFor(
    actor: TeamActor,
    cycleId: string,
  ): Promise<TeamCycle> {
    // Faculty only reach this through the role guard; getVisible limits them to their own cycles.
    const cycle = await this.cycles.getVisible(actor, cycleId);
    this.rules.assertPlacementOpen(cycle, this.clock.now());
    return cycle;
  }

  private async unassigned(cycle: TeamCycle): Promise<UnassignedStudent[]> {
    const participants = await this.directory.listParticipants(
      await this.cycles.rosterOf(cycle),
    );
    const placed = new Set(
      (
        await this.teams.findMemberships(
          cycle.id,
          participants.map((user) => user.id),
        )
      ).map((membership) => membership.userId),
    );
    const seeking = new Map(
      (await this.seekers.list(cycle.id)).map((seeker) => [
        seeker.userId,
        seeker,
      ]),
    );
    return participants
      .filter((user) => !placed.has(user.id))
      .map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        lookingForTeam: seeking.has(user.id),
        note: seeking.get(user.id)?.note ?? null,
        signedIn: user.lastLoginAt !== null,
      }));
  }

  private async nextAutoTeamNumber(cycleId: string): Promise<number> {
    const existing = await this.teams.listByCycle(cycleId);
    return existing.filter((team) => team.origin === "AUTO_GROUP").length + 1;
  }
}
