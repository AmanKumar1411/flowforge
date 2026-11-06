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
    const thisWindow = Math.floor(now / windowMs) * windowMs;
    const current = this.counters.get(key);
    // A later window (another process's clock a little ahead) keeps counting.
    const continues =
      current !== undefined && current.windowStart >= thisWindow;
    const count = continues ? current.count + 1 : 1;
    const windowStart = continues ? current.windowStart : thisWindow;
    this.counters.set(key, { windowStart, count });
    return Promise.resolve({
      allowed: count <= limit,
      hits: count,
      retryAfterMs: Math.max(0, windowStart + windowMs - now),
    });
  }
}
