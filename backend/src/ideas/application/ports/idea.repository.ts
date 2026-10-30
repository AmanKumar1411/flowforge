import { Transaction } from "../../../common/transaction";
import { Idea, IdeaRevision, NewIdea, NewIdeaReview } from "../../domain/idea";

export abstract class IdeaRepository {
  abstract findByTeam(teamId: string, tx?: Transaction): Promise<Idea | null>;
  /**
   * Locks the team row so it cannot be disbanded meanwhile, and the team's idea
   * row if there is one; then reads the idea. `teamExists` is false once it is gone.
   */
  abstract lockTeamIdea(
    teamId: string,
    tx: Transaction,
  ): Promise<{ teamExists: boolean; idea: Idea | null }>;
  /** Throws IDEA_CHANGED if the team got an idea meanwhile. */
  abstract create(idea: NewIdea, tx: Transaction): Promise<Idea>;
  abstract revise(
    id: string,
    revision: IdeaRevision,
    tx: Transaction,
  ): Promise<Idea>;
  /** Records the decision and sets the idea's status to it. */
  abstract review(
    id: string,
    review: NewIdeaReview,
    tx: Transaction,
  ): Promise<Idea>;
  abstract listByCycle(cycleId: string): Promise<Idea[]>;
  /** The ideas of these teams, with their reviews, in one query. */
  abstract listByTeams(teamIds: readonly string[]): Promise<Idea[]>;
}
