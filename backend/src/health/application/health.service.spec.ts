jest.mock("@nestjs/common", () => ({
  Injectable: () => (target: unknown) => target,
}));

import { DomainError } from "../../common/errors/domain-error";
import { HealthService } from "./health.service";
import { DatabaseProbe } from "./ports/database-probe";

const probe = (ping: () => Promise<void>): DatabaseProbe => ({ ping });

describe("HealthService", () => {
  it("is ok when the database answers", async () => {
    const health = new HealthService(probe(() => Promise.resolve()));
    await expect(health.check()).resolves.toEqual({
      status: "ok",
      database: "ok",
    });
  });

  it("reports SERVICE_UNAVAILABLE, without the cause, when the database does not answer", async () => {
    const health = new HealthService(
      probe(() =>
        Promise.reject(new Error("connect ECONNREFUSED 10.0.0.5:5432")),
      ),
    );
    const error = await health.check().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe("SERVICE_UNAVAILABLE");
    expect((error as DomainError).message).not.toMatch(
      /ECONNREFUSED|10\.0\.0\.5/,
    );
  });
});
