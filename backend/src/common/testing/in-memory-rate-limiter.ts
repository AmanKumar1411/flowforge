import { Clock } from "../clock";
import { RateLimitDecision, RateLimiter } from "../rate-limit";

/** The PostgreSQL limiter's fixed windows, in memory, on the given clock. */
export class InMemoryRateLimiter extends RateLimiter {
  readonly counters = new Map<string, { windowStart: number; count: number }>();

  constructor(private readonly clock: Clock) {
    super();
  }

  consume(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<RateLimitDecision> {
    const now = this.clock.now().getTime();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const current = this.counters.get(key);
    const count =
      current && current.windowStart >= windowStart ? current.count + 1 : 1;
    this.counters.set(key, { windowStart, count });
    return Promise.resolve({
      allowed: count <= limit,
      hits: count,
      retryAfterMs: windowStart + windowMs - now,
    });
  }
}
