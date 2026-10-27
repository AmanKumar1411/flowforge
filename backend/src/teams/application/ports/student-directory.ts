import { Transaction } from "../../../common/transaction";
import { DirectoryUser } from "../../domain/team";

/** How the teams module finds people. The adapter delegates to the users module. */
export abstract class StudentDirectory {
  /** Users with these ids, whatever their role; the team rules decide who may join. */
  abstract findByIds(
    ids: readonly string[],
    tx?: Transaction,
  ): Promise<DirectoryUser[]>;
  /** Active students of the batch whose name contains, or email starts with, the query. */
  abstract searchStudents(
    batchYear: number,
    query: string,
    limit: number,
  ): Promise<DirectoryUser[]>;
}
