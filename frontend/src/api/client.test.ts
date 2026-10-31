import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { refreshUntilAnswered, setReachabilityHandler } from "./client";

const json = (status: number, body: object) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

describe("refreshUntilAnswered (H6)", () => {
  const reachability: boolean[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    reachability.length = 0;
    setReachabilityHandler((reachable) => reachability.push(reachable));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("waits out a database outage and a dropped network, then keeps the session", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => json(503, { code: "SERVICE_UNAVAILABLE" }))
      .mockImplementationOnce(() => Promise.reject(new TypeError("Failed to fetch")))
      .mockImplementationOnce(() => json(200, { accessToken: "token" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = refreshUntilAnswered();
    await vi.runAllTimersAsync();
    expect(await result).toEqual({ accessToken: "token" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(reachability).toEqual([false, false, true]);
  });

  it("treats a rate-limited refresh as a wait, not a sign-out", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementationOnce(() => json(429, { code: "TOO_MANY_REQUESTS" }))
        .mockImplementationOnce(() => json(200, { accessToken: "token" })),
    );
    const result = refreshUntilAnswered();
    await vi.runAllTimersAsync();
    expect(await result).toEqual({ accessToken: "token" });
  });

  it("ends the session only on an answer about it, at once", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json(401, { code: "REFRESH_TOKEN_REUSED" })));
    expect(await refreshUntilAnswered()).toEqual({ errorCode: "REFRESH_TOKEN_REUSED", transient: false });
    expect(reachability).toEqual([]);
  });
});
