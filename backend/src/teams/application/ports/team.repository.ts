import { Transaction } from "../../../common/transaction";
import { Membership, NewTeam, Team, TeamChange } from "../../domain/team";

export abstract class TeamRepository {
  abstract findById(id: string): Promise<Team | null>;
  /**
   * Reads the team and locks its row until the transaction ends, so changes
   * to one team run one at a time and each sees the previous one's members.
   */
  abstract findByIdForUpdate(id: string, tx: Transaction): Promise<Team | null>;
  abstract findByMember(cycleId: string, userId: string): Promise<Team | null>;
  abstract listByCycle(cycleId: string): Promise<Team[]>;
  abstract listByMember(userId: string): Promise<Team[]>;
  /** Which of these users already belong to a team in the cycle. */
  abstract findMemberships(
    cycleId: string,
    userIds: readonly string[],
    tx?: Transaction,
  ): Promise<Membership[]>;
  /**
   * Inserts the team with its leader and members. Fails with
   * STUDENT_ALREADY_IN_TEAM when a concurrent request placed one of them first.
   */
  abstract create(team: NewTeam, tx: Transaction): Promise<Team>;
  /** Same failure as `create` for added members. */
  abstract update(
    id: string,
    change: TeamChange,
    tx: Transaction,
  ): Promise<Team>;
  abstract delete(id: string, tx: Transaction): Promise<void>;
}
