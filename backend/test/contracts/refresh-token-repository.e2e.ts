import { after, before, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import {
  NewRefreshToken,
  RefreshTokenRepository,
} from "../../src/auth/application/ports/refresh-token.repository";
import { InMemoryRefreshTokenRepository } from "../../src/auth/testing/in-memory-refresh-token.repository";
import { ImmediateTransactionRunner } from "../../src/common/testing/immediate-transaction.runner";
import { Transaction, TransactionRunner } from "../../src/common/transaction";
import { DOMAIN, startTestApp } from "../support/test-app";

interface Harness {
  repository: RefreshTokenRepository;
  inTransaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  /** A user id that foreign keys accept. */
  newUser(): Promise<string>;
  close(): Promise<void>;
}

const NOW = new Date("2030-01-07T09:00:00.000Z");
const LATER = new Date("2030-01-08T09:00:00.000Z");
const EARLIER = new Date("2030-01-06T09:00:00.000Z");

/** What every RefreshTokenRepository must do, whichever implementation it is (Liskov). */
function refreshTokenRepositoryContract(
  name: string,
  start: () => Promise<Harness>,
): void {
  describe(`RefreshTokenRepository contract: ${name}`, () => {
    let harness: Harness;
    let userId = "";

    before(async () => {
      harness = await start();
      userId = await harness.newUser();
    });
    after(() => harness.close());

    const tx = <T>(work: (tx: Transaction) => Promise<T>) =>
      harness.inTransaction(work);
    const token = (
      overrides: Partial<NewRefreshToken> = {},
    ): NewRefreshToken => ({
      userId,
      familyId: randomUUID(),
      tokenHash: randomUUID(),
      expiresAt: LATER,
      familyExpiresAt: LATER,
      userAgent: null,
      ...overrides,
    });
    const save = (overrides: Partial<NewRefreshToken> = {}) =>
      tx((t) => harness.repository.create(token(overrides), t));

    it("creates a live token with an id, and nothing revoked or replaced", async () => {
      const created = await save({ userAgent: "Firefox" });

      assert.ok(created.id);
      assert.equal(created.revokedAt, null);
      assert.equal(created.replacedById, null);
      assert.equal(created.userAgent, "Firefox");
      assert.ok(created.createdAt instanceof Date);
    });

    it("finds a token by its hash, and null for any other", async () => {
      const created = await save();

      const found = await tx((t) =>
        harness.repository.findByHash(created.tokenHash, t),
      );
      const unknown = await tx((t) =>
        harness.repository.findByHash(randomUUID(), t),
      );

      assert.equal(found?.id, created.id);
      assert.equal(unknown, null);
    });

    it("revokes a live token once: a compare-and-set, false the second time and for an unknown id", async () => {
      const created = await save();

      const first = await tx((t) =>
        harness.repository.revokeIfActive(created.id, NOW, t),
      );
      const second = await tx((t) =>
        harness.repository.revokeIfActive(created.id, LATER, t),
      );
      const unknown = await tx((t) =>
        harness.repository.revokeIfActive(randomUUID(), NOW, t),
      );

      assert.equal(first, true);
      assert.equal(second, false);
      assert.equal(unknown, false);
      const found = await tx((t) =>
        harness.repository.findByHash(created.tokenHash, t),
      );
      assert.deepEqual(found?.revokedAt, NOW, "the first revocation stands");
    });

    it("records a token's successor, and fails for an unknown token", async () => {
      const old = await save();
      const next = await save({ familyId: old.familyId });

      await tx((t) => harness.repository.markReplaced(old.id, next.id, t));

      const found = await tx((t) =>
        harness.repository.findByHash(old.tokenHash, t),
      );
      assert.equal(found?.replacedById, next.id);
      await assert.rejects(
        tx((t) => harness.repository.markReplaced(randomUUID(), next.id, t)),
      );
    });

    it("knows whether a family still has a live token", async () => {
      const live = await save();
      const expired = await save({ expiresAt: EARLIER });
      const revoked = await save();
      await tx((t) => harness.repository.revokeIfActive(revoked.id, NOW, t));

      const has = (familyId: string) =>
        tx((t) => harness.repository.hasActiveToken(familyId, NOW, t));

      assert.equal(await has(live.familyId), true);
      assert.equal(await has(expired.familyId), false);
      assert.equal(await has(revoked.familyId), false);
      assert.equal(await has(randomUUID()), false);
    });

    it("revokes a whole family and only that family, counting what it revoked", async () => {
      const familyId = randomUUID();
      const already = await save({ familyId });
      await save({ familyId });
      await save({ familyId });
      const other = await save();
      await tx((t) =>
        harness.repository.revokeIfActive(already.id, EARLIER, t),
      );

      const count = await tx((t) =>
        harness.repository.revokeFamily(familyId, NOW, t),
      );
      const again = await tx((t) =>
        harness.repository.revokeFamily(familyId, NOW, t),
      );

      assert.equal(count, 2);
      assert.equal(again, 0);
      const earlier = await tx((t) =>
        harness.repository.findByHash(already.tokenHash, t),
      );
      assert.deepEqual(earlier?.revokedAt, EARLIER, "an earlier time stays");
      const untouched = await tx((t) =>
        harness.repository.findByHash(other.tokenHash, t),
      );
      assert.equal(untouched?.revokedAt, null);
    });

    it("revokes every family of one user and no one else's", async () => {
      const someone = await harness.newUser();
      await save({ userId: someone });
      await save({ userId: someone });
      const other = await save();

      const count = await tx((t) =>
        harness.repository.revokeAllForUser(someone, NOW, t),
      );

      assert.equal(count, 2);
      const untouched = await tx((t) =>
        harness.repository.findByHash(other.tokenHash, t),
      );
      assert.equal(untouched?.revokedAt, null);
    });
  });
}

refreshTokenRepositoryContract("in memory", () => {
  const transactions = new ImmediateTransactionRunner();
  return Promise.resolve({
    repository: new InMemoryRefreshTokenRepository(),
    inTransaction: (work) => transactions.run(work),
    newUser: () => Promise.resolve(randomUUID()),
    close: () => Promise.resolve(),
  });
});

refreshTokenRepositoryContract("Prisma, on the test database", async () => {
  const app = await startTestApp();
  await app.reset();
  const transactions = app.get(TransactionRunner);
  return {
    repository: app.get(RefreshTokenRepository),
    inTransaction: (work) => transactions.run(work),
    newUser: async () =>
      (
        await app.prisma.user.create({
          data: {
            email: `session.${randomUUID().slice(0, 8)}26csai${DOMAIN}`,
            name: "Student",
            role: "STUDENT",
          },
        })
      ).id,
    close: () => app.close(),
  };
});
