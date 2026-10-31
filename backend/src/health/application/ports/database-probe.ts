/** Answers whether the database can run a query right now. */
export abstract class DatabaseProbe {
  /** Resolves when a trivial query succeeds; rejects otherwise. */
  abstract ping(): Promise<void>;
}
