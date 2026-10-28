import { Transaction } from "../../../common/transaction";
import {
  CatalogIdea,
  CatalogIdeaContent,
  NewCatalogIdea,
} from "../../domain/idea";

/** The faculty's list of ideas per cycle, with how many teams picked each. */
export abstract class IdeaCatalogRepository {
  /** Oldest first, so the list reads in the order the faculty wrote it. */
  abstract list(cycleId: string): Promise<CatalogIdea[]>;
  /**
   * Reads the cycle's catalog idea and locks it `FOR SHARE` so it cannot be
   * removed until the transaction ends; null if it is not in the cycle.
   */
  abstract lock(
    id: string,
    cycleId: string,
    tx: Transaction,
  ): Promise<CatalogIdea | null>;
  abstract create(idea: NewCatalogIdea, tx: Transaction): Promise<CatalogIdea>;
  abstract update(
    id: string,
    content: CatalogIdeaContent,
    tx: Transaction,
  ): Promise<CatalogIdea>;
  /** Throws CATALOG_IDEA_PICKED if a team picked it meanwhile. */
  abstract remove(id: string, tx: Transaction): Promise<void>;
}
