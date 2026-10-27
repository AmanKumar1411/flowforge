declare const transactionBrand: unique symbol;

/**
 * An open database transaction. It is opaque outside the persistence layer, so
 * services can pass one between modules without depending on Prisma.
 */
export type Transaction = { readonly [transactionBrand]: true };

export abstract class TransactionRunner {
  abstract run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
}
