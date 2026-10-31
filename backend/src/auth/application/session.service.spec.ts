import { AuditService } from "../../audit/audit.service";
import { AuditEvent } from "../../audit/domain/audit-event";
import { FixedClock } from "../../common/testing/fixed-clock";
import { ImmediateTransactionRunner } from "../../common/testing/immediate-transaction.runner";
import { InMemoryRateLimiter } from "../../common/testing/in-memory-rate-limiter";
import { Transaction } from "../../common/transaction";
import { createTestAppConfig } from "../../config/testing/test-environment";
import { User } from "../../users/domain/user";
import { UsersService } from "../../users/users.service";
import { InMemoryRefreshTokenRepository } from "../testing/in-memory-refresh-token.repository";
import { hashRefreshToken, SessionService } from "./session.service";

// Jest cannot load NestJS 12's ES modules on Node 22; the classes under test only need the decorator.
jest.mock("@nestjs/common", () => ({
  Injectable: () => (target: unknown) => target,
}));

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const tx = {} as Transaction;

describe("SessionService", () => {
  let clock: FixedClock;
  let tokens: InMemoryRefreshTokenRepository;
  let audited: AuditEvent[];
  let user: Pick<User, "id" | "status">;
  let sessions: SessionService;

  const createSessions = (lifetimes: Record<string, string> = {}) =>
    new SessionService(
      tokens,
      { findById: async () => user } as unknown as UsersService,
      {
        record: async (_tx: Transaction, event: AuditEvent) => {
          audited.push(event);
        },
      } as unknown as AuditService,
      new ImmediateTransactionRunner(),
      clock,
      createTestAppConfig(lifetimes),
      new InMemoryRateLimiter(clock),
    );

  beforeEach(() => {
    clock = new FixedClock("2026-10-23T09:00:00.000Z");
    tokens = new InMemoryRefreshTokenRepository();
    audited = [];
    user = { id: "user-1", status: "ACTIVE" };
    // The documented configuration: a session lasts one day.
    sessions = createSessions();
  });

  const start = () => sessions.startFamily(user.id, "jest", tx);
  const record = (value: string) =>
    [...tokens.records.values()].find(
      (r) => r.tokenHash === hashRefreshToken(value),
    );

  it("stores only a SHA-256 hash of a 256-bit token", async () => {
    const issued = await start();

    expect(Buffer.from(issued.value, "base64url")).toHaveLength(32);
    expect(record(issued.value)?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(
      [...tokens.records.values()].some((r) => r.tokenHash === issued.value),
    ).toBe(false);
    expect(issued.expiresAt).toEqual(new Date(clock.now().getTime() + DAY_MS));
  });

  it("rotates: issues a new token in the same family and revokes the old one", async () => {
    const first = await start();
    const rotated = await sessions.rotate(first.value, "jest");

    expect(rotated.userId).toBe(user.id);
    expect(rotated.refreshToken.value).not.toBe(first.value);
    const old = record(first.value);
    const next = record(rotated.refreshToken.value);
    expect(old?.revokedAt).toEqual(clock.now());
    expect(old?.replacedById).toBe(next?.id);
    expect(next?.familyId).toBe(old?.familyId);
    expect(next?.revokedAt).toBeNull();
  });

  it("revokes the whole family when a rotated token is replayed after the grace window", async () => {
    const first = await start();
    const second = await sessions.rotate(first.value, "jest");
    clock.advance(11_000);

    await expect(sessions.rotate(first.value, "jest")).rejects.toMatchObject({
      code: "REFRESH_TOKEN_REUSED",
    });
    await expect(
      sessions.rotate(second.refreshToken.value, "jest"),
    ).rejects.toMatchObject({ code: "TOKEN_REVOKED" });
    expect(audited).toEqual([
      expect.objectContaining({
        action: "REFRESH_TOKEN_REUSE_DETECTED",
        entityId: record(first.value)?.familyId,
      }),
    ]);
  });

  it("gives a token in the same family to a token presented again within the grace window (two tabs, H14)", async () => {
    const first = await start();
    const winner = await sessions.rotate(first.value, "jest");
    clock.advance(3_000);
    const sibling = await sessions.rotate(first.value, "jest");

    expect(record(sibling.refreshToken.value)?.familyId).toBe(
      record(first.value)?.familyId,
    );
    // Both tokens stay usable, and nothing was reported as reuse.
    await expect(
      sessions.rotate(winner.refreshToken.value, "jest"),
    ).resolves.toBeDefined();
    await expect(
      sessions.rotate(sibling.refreshToken.value, "jest"),
    ).resolves.toBeDefined();
    expect(audited).toEqual([]);
  });

  it("gives no grace to a token of a family that has ended", async () => {
    const first = await start();
    await sessions.rotate(first.value, "jest");
    await sessions.revokeFamilyOf(first.value, tx);
    await expect(sessions.rotate(first.value, "jest")).rejects.toMatchObject({
      code: "REFRESH_TOKEN_REUSED",
    });
  });

  it("treats a lost compare-and-set as reuse", async () => {
    const first = await start();
    jest.spyOn(tokens, "revokeIfActive").mockResolvedValueOnce(false);

    await expect(sessions.rotate(first.value, "jest")).rejects.toMatchObject({
      code: "REFRESH_TOKEN_REUSED",
    });
  });

  it("rejects an expired token", async () => {
    const first = await start();
    clock.advance(DAY_MS);

    await expect(sessions.rotate(first.value, "jest")).rejects.toMatchObject({
      code: "INVALID_REFRESH_TOKEN",
    });
  });

  it("ends the session one day after sign-in, however often it is refreshed", async () => {
    const signedInAt = clock.now().getTime();
    let current = (await start()).value;
    for (let hour = 6; hour < 24; hour += 6) {
      clock.advance(6 * HOUR_MS);
      current = (await sessions.rotate(current, "jest")).refreshToken.value;
    }
    // A successor never outlives its family.
    expect(record(current)?.expiresAt).toEqual(new Date(signedInAt + DAY_MS));
    expect(record(current)?.familyExpiresAt).toEqual(
      new Date(signedInAt + DAY_MS),
    );

    clock.advance(6 * HOUR_MS);
    await expect(sessions.rotate(current, "jest")).rejects.toMatchObject({
      code: "INVALID_REFRESH_TOKEN",
    });
  });

  it("uses the configured lifetimes", async () => {
    sessions = createSessions({
      REFRESH_TOKEN_TTL_DAYS: "7",
      REFRESH_FAMILY_MAX_DAYS: "30",
    });
    const issued = await start();

    expect(issued.expiresAt).toEqual(
      new Date(clock.now().getTime() + 7 * DAY_MS),
    );
    expect(record(issued.value)?.familyExpiresAt).toEqual(
      new Date(clock.now().getTime() + 30 * DAY_MS),
    );
  });

  it("rejects an unknown token", async () => {
    await expect(sessions.rotate("not-a-token", "jest")).rejects.toMatchObject({
      code: "INVALID_REFRESH_TOKEN",
    });
  });

  it("does not report reuse for a token ended by logout", async () => {
    const first = await start();
    await sessions.revokeFamilyOf(first.value, tx);

    await expect(sessions.rotate(first.value, "jest")).rejects.toMatchObject({
      code: "TOKEN_REVOKED",
    });
    expect(audited).toEqual([]);
  });

  it("refuses to refresh a deactivated user and ends the family", async () => {
    const first = await start();
    user = { ...user, status: "DEACTIVATED" };

    await expect(sessions.rotate(first.value, "jest")).rejects.toMatchObject({
      code: "ACCOUNT_DEACTIVATED",
    });
    expect(record(first.value)?.revokedAt).not.toBeNull();
  });

  it("revokes every family of a user", async () => {
    const a = await start();
    const b = await start();
    await sessions.revokeAllForUser(user.id, tx);

    for (const token of [a, b]) {
      await expect(sessions.rotate(token.value, "jest")).rejects.toMatchObject({
        code: "TOKEN_REVOKED",
      });
    }
  });

  it("limits refreshes per family, not per caller: the 11th in a minute is refused, other families are not", async () => {
    sessions = createSessions({ AUTH_REFRESH_RATE_LIMIT_PER_MINUTE: "10" });
    let token = (await start()).value;
    for (let refresh = 1; refresh <= 10; refresh += 1) {
      token = (await sessions.rotate(token, "jest")).refreshToken.value;
    }
    await expect(sessions.rotate(token, "jest")).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    // The limited token is still the family's current one: no reuse, no revocation.
    expect(record(token)?.revokedAt).toBeNull();
    const other = await start();
    await expect(sessions.rotate(other.value, "jest")).resolves.toBeDefined();

    clock.advance(60_000);
    await expect(sessions.rotate(token, "jest")).resolves.toBeDefined();
  });
});
