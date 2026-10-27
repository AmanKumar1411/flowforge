import { randomUUID } from "node:crypto";
import { TeamRepository } from "../application/ports/team.repository";
import { TeamDomainError } from "../domain/team.errors";
import { Membership, NewTeam, Team, TeamChange } from "../domain/team";
import { InMemoryStudentDirectory } from "./in-memory-student-directory";

interface StoredTeam {
  id: string;
  cycleId: string;
  name: string;
  leaderId: string;
  members: { userId: string; addedAt: Date }[];
  createdAt: Date;
  updatedAt: Date;
}

/** Mirrors the database's unique key: one team per student per cycle. */
export class InMemoryTeamRepository extends TeamRepository {
  private readonly teams = new Map<string, StoredTeam>();

  constructor(private readonly directory: InMemoryStudentDirectory) {
    super();
  }

  async findById(id: string): Promise<Team | null> {
    const team = this.teams.get(id);
    return team ? this.toTeam(team) : null;
  }

  findByIdForUpdate(id: string): Promise<Team | null> {
    return this.findById(id);
  }

  async findByMember(cycleId: string, userId: string): Promise<Team | null> {
    const team = [...this.teams.values()].find(
      (candidate) =>
        candidate.cycleId === cycleId &&
        candidate.members.some((member) => member.userId === userId),
    );
    return team ? this.toTeam(team) : null;
  }

  async listByCycle(cycleId: string): Promise<Team[]> {
    return [...this.teams.values()]
      .filter((team) => team.cycleId === cycleId)
      .map((team) => this.toTeam(team));
  }

  async listByMember(userId: string): Promise<Team[]> {
    return [...this.teams.values()]
      .filter((team) => team.members.some((member) => member.userId === userId))
      .map((team) => this.toTeam(team));
  }

  async findMemberships(
    cycleId: string,
    userIds: readonly string[],
  ): Promise<Membership[]> {
    return [...this.teams.values()]
      .filter((team) => team.cycleId === cycleId)
      .flatMap((team) =>
        team.members
          .filter((member) => userIds.includes(member.userId))
          .map((member) => ({ userId: member.userId, teamId: team.id })),
      );
  }

  async create(team: NewTeam): Promise<Team> {
    const userIds = [team.leaderId, ...team.memberIds];
    this.assertFree(team.cycleId, userIds);
    const now = new Date();
    const stored: StoredTeam = {
      id: randomUUID(),
      cycleId: team.cycleId,
      name: team.name,
      leaderId: team.leaderId,
      members: userIds.map((userId) => ({ userId, addedAt: now })),
      createdAt: now,
      updatedAt: now,
    };
    this.teams.set(stored.id, stored);
    return this.toTeam(stored);
  }

  async update(id: string, change: TeamChange): Promise<Team> {
    const team = this.teams.get(id);
    if (!team) throw new Error(`No team ${id}`);
    this.assertFree(team.cycleId, change.addMemberIds);
    const now = new Date();
    const updated: StoredTeam = {
      ...team,
      name: change.name ?? team.name,
      members: [
        ...team.members.filter(
          (member) => !change.removeMemberIds.includes(member.userId),
        ),
        ...change.addMemberIds.map((userId) => ({ userId, addedAt: now })),
      ],
      updatedAt: now,
    };
    this.teams.set(id, updated);
    return this.toTeam(updated);
  }

  async delete(id: string): Promise<void> {
    this.teams.delete(id);
  }

  private assertFree(cycleId: string, userIds: readonly string[]): void {
    const taken = [...this.teams.values()].some(
      (team) =>
        team.cycleId === cycleId &&
        team.members.some((member) => userIds.includes(member.userId)),
    );
    if (taken) {
      throw new TeamDomainError(
        "STUDENT_ALREADY_IN_TEAM",
        "Unique key (cycleId, userId) violated",
      );
    }
  }

  private toTeam(team: StoredTeam): Team {
    return {
      ...team,
      members: team.members.map((member) => {
        const user = this.directory.get(member.userId);
        return {
          ...member,
          name: user?.name ?? "",
          email: user?.email ?? "",
        };
      }),
    };
  }
}
