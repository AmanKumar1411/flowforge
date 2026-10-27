import { Transaction } from "../../../common/transaction";
import { CycleRoster } from "../../../course-cycles/domain/cycle-roster";
import { DirectoryUser } from "../../domain/team";

/** How the teams module finds people. The adapter delegates to the users module. */
export abstract class StudentDirectory {
  /** Users with these ids, whatever their role; the team rules decide who may join. */
  abstract findByIds(
    ids: readonly string[],
    tx?: Transaction,
  ): Promise<DirectoryUser[]>;
  /** The roster's active students whose name contains, or email starts with, the query. */
  abstract search(
    roster: CycleRoster,
    query: string,
    limit: number,
  ): Promise<DirectoryUser[]>;
  /** Every active student on the roster, ordered by name. */
  abstract listParticipants(roster: CycleRoster): Promise<DirectoryUser[]>;
}
