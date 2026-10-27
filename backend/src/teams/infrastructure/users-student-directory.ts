import { Injectable } from "@nestjs/common";
import { Transaction } from "../../common/transaction";
import { CycleRoster } from "../../course-cycles/domain/cycle-roster";
import { StudentScope } from "../../users/domain/user";
import { UsersService } from "../../users/users.service";
import { StudentDirectory } from "../application/ports/student-directory";
import { DirectoryUser } from "../domain/team";

const scopeOf = ({ scope }: CycleRoster): StudentScope =>
  scope.kind === "BATCH"
    ? { batchYear: scope.batchYear }
    : { emails: [...scope.emails] };

@Injectable()
export class UsersStudentDirectory extends StudentDirectory {
  constructor(private readonly users: UsersService) {
    super();
  }

  findByIds(
    ids: readonly string[],
    tx?: Transaction,
  ): Promise<DirectoryUser[]> {
    return this.users.findByIds(ids, tx);
  }

  search(
    roster: CycleRoster,
    query: string,
    limit: number,
  ): Promise<DirectoryUser[]> {
    return this.users.searchActiveStudents({
      scope: scopeOf(roster),
      query,
      limit,
    });
  }

  listParticipants(roster: CycleRoster): Promise<DirectoryUser[]> {
    return this.users.listActiveStudents(scopeOf(roster));
  }
}
