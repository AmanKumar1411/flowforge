import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { ThrottlerStorage } from "@nestjs/throttler";
import { Clock } from "../common/clock";
import {
  RateLimitDecision,
  RateLimiter,
  ONE_MINUTE_MS,
} from "../common/rate-limit";
import { Transaction } from "../common/transaction";
import { PrismaService } from "./prisma.service";

type ThrottlerStorageRecord = Awaited<
  ReturnType<ThrottlerStorage["increment"]>
>;

interface Hit {
  hits: number;
  windowEndsAt: number;
}

/**
 * Rate-limit counters in PostgreSQL, so every API process shares them
 * (ADR 023). One UNLOGGED row per key and fixed window, counted with a single
 * atomic upsert. It serves both the services' `RateLimiter` port and Nest's
 * `ThrottlerStorage` (the per-IP sign-in limit). Expired rows are swept every
 * minute.
 */
@Injectable()
export class PostgresRateLimiter
  extends RateLimiter
  implements ThrottlerStorage, OnApplicationBootstrap, OnApplicationShutdown
{
  private sweeper: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {
    super();
  }

  async consume(
    key: string,
    limit: number,
    windowMs: number,
    tx?: Transaction,
  ): Promise<RateLimitDecision> {
    const { hits, windowEndsAt } = await this.hit(key, windowMs, tx);
    return {
      allowed: hits <= limit,
      hits,
      retryAfterMs: Math.max(0, windowEndsAt - this.clock.now().getTime()),
    };
  }

  /** Nest's guard: blocked from the first hit over the limit until the window ends. */
  async increment(
    key: string,
    ttl: number,
    limit: number,
    _blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const { hits, windowEndsAt } = await this.hit(
      `throttler:${throttlerName}:${key}`,
      ttl,
    );
    const seconds = Math.ceil(
      Math.max(0, windowEndsAt - this.clock.now().getTime()) / 1000,
    );
    const isBlocked = hits > limit;
    return {
      totalHits: hits,
      timeToExpire: seconds,
      isBlocked,
      timeToBlockExpire: isBlocked ? seconds : 0,
    };
  }

  onApplicationBootstrap(): void {
    this.sweeper = setInterval(() => void this.sweep(), ONE_MINUTE_MS);
    this.sweeper.unref();
  }

  onApplicationShutdown(): void {
    if (this.sweeper) clearInterval(this.sweeper);
  }

  /** Deletes counters whose window has ended. */
  async sweep(): Promise<number> {
    try {
      return await this.prisma.$executeRaw`
        DELETE FROM "RateLimitCounter" WHERE "expiresAt" < ${BigInt(this.clock.now().getTime())}`;
    } catch {
      // A sweep that fails (for example while shutting down) is retried a minute later.
      return 0;
    }
  }

  // A newer window resets the count; a row from a later window (another process's clock a
  // little ahead) keeps counting rather than going back.
  private async hit(
    key: string,
    windowMs: number,
    tx?: Transaction,
  ): Promise<Hit> {
    const now = this.clock.now().getTime();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const windowEndsAt = windowStart + windowMs;
    const rows = await this.prisma.client(tx).$queryRaw<
      { count: number; windowStart: bigint }[]
    >`
      INSERT INTO "RateLimitCounter" ("key", "windowStart", "count", "expiresAt")
      VALUES (${key}, ${BigInt(windowStart)}, 1, ${BigInt(windowEndsAt)})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "RateLimitCounter"."windowStart" >= EXCLUDED."windowStart"
          THEN "RateLimitCounter"."count" + 1
          ELSE 1
        END,
        "windowStart" = GREATEST("RateLimitCounter"."windowStart", EXCLUDED."windowStart"),
        "expiresAt" = GREATEST("RateLimitCounter"."expiresAt", EXCLUDED."expiresAt")
      RETURNING "count", "windowStart"`;
    const row = rows[0];
    return {
      hits: Number(row.count),
      windowEndsAt: Number(row.windowStart) + windowMs,
    };
  }
}
