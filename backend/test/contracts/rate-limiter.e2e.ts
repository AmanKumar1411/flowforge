import { after, before, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { RateLimiter } from "../../src/common/rate-limit";
import { FixedClock } from "../../src/common/testing/fixed-clock";
import { ImmediateTransactionRunner } from "../../src/common/testing/immediate-transaction.runner";
import { InMemoryRateLimiter } from "../../src/common/testing/in-memory-rate-limiter";
import { Transaction, TransactionRunner } from "../../src/common/transaction";
import { startTestApp } from "../support/test-app";

const WINDOW_MS = 60_000;

interface Harness {
  limiter: RateLimiter;
  clock: FixedClock;
  inTransaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const startOfAMinute = () => new FixedClock("2030-01-07T09:00:00.000Z");

/** What every rate-limit storage must do, whichever implementation it is (Liskov). */
function rateLimiterContract(
  name: string,
  start: () => Promise<Harness>,
): void {
  describe(`RateLimiter contract: ${name}`, () => {
    let harness: Harness;

    before(async () => {
      harness = await start();
    });
    after(() => harness.close());

    const hit = (key: string, limit = 3) =>
      harness.limiter.consume(key, limit, WINDOW_MS);

    it("allows up to the limit and refuses after it, counting every hit", async () => {
      const key = randomUUID();
      const decisions = [
        await hit(key),
        await hit(key),
        await hit(key),
        await hit(key),
      ];

      assert.deepEqual(
        decisions.map(({ allowed, hits }) => [allowed, hits]),
        [
          [true, 1],
          [true, 2],
          [true, 3],
          [false, 4],
        ],
      );
    });

    it("keeps each key's count apart", async () => {
      const [one, two] = [randomUUID(), randomUUID()];
      await hit(one);
      await hit(one);

      assert.equal((await hit(two)).hits, 1);
      assert.equal((await hit(one)).hits, 3);
    });

    it("says how long until the window ends", async () => {
      const key = randomUUID();
      harness.clock.advance(15_000);

      const decision = await hit(key);
      harness.clock.advance(-15_000);

      assert.equal(decision.retryAfterMs, WINDOW_MS - 15_000);
    });

    it("starts counting again in the next window", async () => {
      const key = randomUUID();
      await hit(key, 1);
      assert.equal((await hit(key, 1)).allowed, false);

      harness.clock.advance(WINDOW_MS);

      const next = await hit(key, 1);
      assert.deepEqual([next.allowed, next.hits], [true, 1]);
    });

    it("keeps counting, and keeps the later window, when another process's clock is a little behind", async () => {
      const key = randomUUID();
      harness.clock.advance(WINDOW_MS);
      await hit(key);
      await hit(key);

      harness.clock.advance(-1_000);
      const behind = await hit(key);
      harness.clock.advance(1_000);
      const caughtUp = await hit(key);

      assert.equal(
        behind.hits,
        3,
        "an earlier window does not reset the count",
      );
      assert.equal(behind.retryAfterMs, WINDOW_MS + 1_000);
      assert.equal(caughtUp.hits, 4, "nor does it move the window back");
    });

    it("loses no hit when many arrive at once", async () => {
      const key = randomUUID();

      const decisions = await Promise.all(
        Array.from({ length: 20 }, () => hit(key, 100)),
      );

      assert.deepEqual(
        decisions.map(({ hits }) => hits).sort((a, b) => a - b),
        Array.from({ length: 20 }, (_, index) => index + 1),
      );
    });

    it("counts on an open transaction when given one", async () => {
      const key = randomUUID();

      const inside = await harness.inTransaction((tx) =>
        harness.limiter.consume(key, 3, WINDOW_MS, tx),
      );

      assert.equal(inside.hits, 1);
      assert.equal((await hit(key)).hits, 2);
    });
  });
}

rateLimiterContract("in memory", () => {
  const clock = startOfAMinute();
  const transactions = new ImmediateTransactionRunner();
  return Promise.resolve({
    limiter: new InMemoryRateLimiter(clock),
    clock,
    inTransaction: (work) => transactions.run(work),
    close: () => Promise.resolve(),
  });
});

rateLimiterContract("PostgreSQL, on the test database", async () => {
  const clock = startOfAMinute();
  const app = await startTestApp({ clock });
  await app.reset();
  const transactions = app.get(TransactionRunner);
  return {
    limiter: app.get(RateLimiter),
    clock,
    inTransaction: (work) => transactions.run(work),
    close: () => app.close(),
  };
});
