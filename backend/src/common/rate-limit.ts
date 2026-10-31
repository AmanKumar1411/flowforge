import { CommonErrorCode, DomainError } from "./errors/domain-error";
import { Transaction } from "./transaction";

export const ONE_MINUTE_MS = 60_000;

/** The outcome of counting one hit against a limit. */
export interface RateLimitDecision {
  allowed: boolean;
  /** Hits in the current window, this one included. */
  hits: number;
  /** Until the current window ends. */
  retryAfterMs: number;
}

/**
 * Fixed-window counters shared by every API process (ADR 023). A key names
 * what a limit protects: a refresh-token family, a Google account, one user's
 * writes. Pass the open transaction when there is one, so a request never
 * needs a second pooled connection.
 */
export abstract class RateLimiter {
  abstract consume(
    key: string,
    limit: number,
    windowMs: number,
    tx?: Transaction,
  ): Promise<RateLimitDecision>;
}

export class RateLimitedError extends DomainError<CommonErrorCode> {
  constructor(message = "Too many requests, try again in a minute") {
    super("TOO_MANY_REQUESTS", message);
  }
}
