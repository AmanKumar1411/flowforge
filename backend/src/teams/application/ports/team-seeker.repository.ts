import { Transaction } from "../../../common/transaction";
import { TeamSeeker } from "../../domain/team";

/** Students who switched on "Looking for a team" in a cycle. */
export abstract class TeamSeekerRepository {
  /** Creates or updates the student's entry. */
  abstract save(
    cycleId: string,
    userId: string,
    note: string | null,
  ): Promise<void>;
  abstract remove(cycleId: string, userId: string): Promise<void>;
  /** Clears the entries of students who just joined a team, inside that change's transaction. */
  abstract removeMany(
    cycleId: string,
    userIds: readonly string[],
    tx: Transaction,
  ): Promise<void>;
  abstract list(cycleId: string): Promise<TeamSeeker[]>;
}
