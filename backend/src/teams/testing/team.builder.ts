import { Team, TeamMember, TeamOrigin } from "../domain/team";

const CREATED = new Date("2030-01-07T09:00:00.000Z");

/**
 * A valid team for a test: `aTeam().ledBy("leader").withMemberIds("member").build()`.
 * The leader is always one of the members, as in a saved team.
 */
export class TeamBuilder {
  private id = "team-1";
  private cycleId = "cycle-1";
  private name = "Falcon";
  private leaderId = "leader";
  private origin: TeamOrigin = "STUDENT";
  private others: string[] = [];

  withId(id: string): this {
    this.id = id;
    return this;
  }

  inCycle(cycleId: string): this {
    this.cycleId = cycleId;
    return this;
  }

  named(name: string): this {
    this.name = name;
    return this;
  }

  ledBy(userId: string): this {
    this.leaderId = userId;
    return this;
  }

  formedBy(origin: TeamOrigin): this {
    this.origin = origin;
    return this;
  }

  /** This many members in all, the leader included. */
  withMembers(count: number): this {
    this.others = Array.from(
      { length: count - 1 },
      (_, index) => `member-${index + 1}`,
    );
    return this;
  }

  /** The members other than the leader. */
  withMemberIds(...userIds: string[]): this {
    this.others = userIds;
    return this;
  }

  build(): Team {
    const member = (userId: string): TeamMember => ({
      userId,
      name: userId,
      email: `${userId}@x`,
      addedById: this.leaderId,
      addedAt: CREATED,
    });
    return {
      id: this.id,
      cycleId: this.cycleId,
      name: this.name,
      leaderId: this.leaderId,
      origin: this.origin,
      members: [this.leaderId, ...this.others].map(member),
      createdAt: CREATED,
      updatedAt: CREATED,
    };
  }
}

export const aTeam = (): TeamBuilder => new TeamBuilder();
