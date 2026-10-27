import { Injectable } from "@nestjs/common";
import { Transaction } from "../../common/transaction";
import { UsersService } from "../../users/users.service";
import { StudentDirectory } from "../application/ports/student-directory";
import { DirectoryUser } from "../domain/team";

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

  searchStudents(
    batchYear: number,
    query: string,
    limit: number,
  ): Promise<DirectoryUser[]> {
    return this.users.searchActiveStudents({ batchYear, query, limit });
  }
}
