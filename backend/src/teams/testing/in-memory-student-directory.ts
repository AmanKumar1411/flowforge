import { CycleRoster } from "../../course-cycles/domain/cycle-roster";
import { StudentDirectory } from "../application/ports/student-directory";
import { DirectoryUser } from "../domain/team";

export class InMemoryStudentDirectory extends StudentDirectory {
  private readonly users = new Map<string, DirectoryUser>();

  add(...users: DirectoryUser[]): void {
    for (const user of users) this.users.set(user.id, user);
  }

  get(id: string): DirectoryUser | undefined {
    return this.users.get(id);
  }

  /** For the users-service double in specs. */
  findByEmails(emails: readonly string[]): DirectoryUser[] {
    return [...this.users.values()].filter((user) =>
      emails.includes(user.email),
    );
  }

  async findByIds(ids: readonly string[]): Promise<DirectoryUser[]> {
    return ids.flatMap((id) => this.users.get(id) ?? []);
  }

  async search(
    roster: CycleRoster,
    query: string,
    limit: number,
  ): Promise<DirectoryUser[]> {
    const needle = query.toLowerCase();
    return (await this.listParticipants(roster))
      .filter(
        (user) =>
          user.name.toLowerCase().includes(needle) ||
          user.email.startsWith(needle),
      )
      .slice(0, limit);
  }

  async listParticipants(roster: CycleRoster): Promise<DirectoryUser[]> {
    return [...this.users.values()]
      .filter((user) => roster.includes(user))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}
