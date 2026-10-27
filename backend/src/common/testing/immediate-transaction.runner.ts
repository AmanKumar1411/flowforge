import { Transaction, TransactionRunner } from "../transaction";

/** Runs the work without a database; for unit tests with in-memory repositories. */
export class ImmediateTransactionRunner extends TransactionRunner {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return work({} as Transaction);
  }
}
