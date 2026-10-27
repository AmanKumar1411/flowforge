import { TeamSeekerRepository } from "../application/ports/team-seeker.repository";
import { TeamSeeker } from "../domain/team";

export class InMemoryTeamSeekerRepository extends TeamSeekerRepository {
  private readonly seekers = new Map<
    string,
    TeamSeeker & { cycleId: string }
  >();

  async save(
    cycleId: string,
    userId: string,
    note: string | null,
  ): Promise<void> {
    const key = `${cycleId}:${userId}`;
    const createdAt = this.seekers.get(key)?.createdAt ?? new Date();
    this.seekers.set(key, { cycleId, userId, note, createdAt });
  }

  async remove(cycleId: string, userId: string): Promise<void> {
    this.seekers.delete(`${cycleId}:${userId}`);
  }

  async removeMany(cycleId: string, userIds: readonly string[]): Promise<void> {
    for (const userId of userIds) this.seekers.delete(`${cycleId}:${userId}`);
  }

  async list(cycleId: string): Promise<TeamSeeker[]> {
    return [...this.seekers.values()]
      .filter((seeker) => seeker.cycleId === cycleId)
      .map(({ userId, note, createdAt }) => ({ userId, note, createdAt }));
  }
}
