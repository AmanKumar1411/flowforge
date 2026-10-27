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

  async findByIds(ids: readonly string[]): Promise<DirectoryUser[]> {
    return ids.flatMap((id) => this.users.get(id) ?? []);
  }

  async searchStudents(
    batchYear: number,
    query: string,
    limit: number,
  ): Promise<DirectoryUser[]> {
    const needle = query.toLowerCase();
    return [...this.users.values()]
      .filter(
        (user) =>
          user.role === "STUDENT" &&
          user.status === "ACTIVE" &&
          user.batchYear === batchYear &&
          (user.name.toLowerCase().includes(needle) ||
            user.email.startsWith(needle)),
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, limit);
  }
}
