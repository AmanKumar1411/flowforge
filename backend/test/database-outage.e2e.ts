import { TEST_DATABASE_URL } from "./support/test-env";
import { after, before, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { createServer, connect, Server, Socket } from "node:net";
import { DOMAIN, startTestApp, TestApp } from "./support/test-app";

/** A TCP relay to the test database that the test can cut and restore, like a database restart. */
class Relay {
  private server: Server | null = null;
  private readonly sockets = new Set<Socket>();
  port = 0;

  constructor(private readonly target: { host: string; port: number }) {}

  async open(): Promise<void> {
    this.server = createServer((client) => {
      const upstream = connect(this.target.port, this.target.host);
      for (const socket of [client, upstream]) {
        this.sockets.add(socket);
        socket.on("close", () => this.sockets.delete(socket));
        socket.on("error", () => socket.destroy());
      }
      client.pipe(upstream).pipe(client);
    });
    await new Promise<void>((resolve) =>
      this.server!.listen(this.port, "127.0.0.1", resolve),
    );
    this.port = (this.server.address() as { port: number }).port;
  }

  async cut(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
    await new Promise((resolve) => this.server?.close(resolve));
    this.server = null;
  }
}

// H6: a short database outage used to sign out every student who loaded a page during it (BUG-8).
describe("A database outage", () => {
  const database = new URL(TEST_DATABASE_URL);
  const relay = new Relay({
    host: database.hostname,
    port: Number(database.port || 5432),
  });
  let app: TestApp;

  before(async () => {
    await relay.open();
    const throughRelay = new URL(TEST_DATABASE_URL);
    throughRelay.hostname = "127.0.0.1";
    throughRelay.port = String(relay.port);
    app = await startTestApp({
      env: { DATABASE_URL: throughRelay.toString() },
    });
    await app.reset();
  });
  after(async () => {
    await app.close();
    await relay.cut();
  });

  it("answers 503 without details and keeps the session, which refreshes once the database is back", async () => {
    const student = await app.browser().signIn(`meera.25${DOMAIN}`);
    const cookie = student.cookie("flowforge_refresh");
    assert.ok(cookie);

    await relay.cut();
    const refresh = await student.refresh();
    assert.equal(refresh.status, 503);
    assert.equal(refresh.body.code, "SERVICE_UNAVAILABLE");
    assert.doesNotMatch(
      JSON.stringify(refresh.body),
      /ECONN|127\.0\.0\.1|5432|postgres|terminated|stack/i,
    );
    assert.equal(
      student.cookie("flowforge_refresh"),
      cookie,
      "the refresh cookie is not cleared during an outage",
    );
    assert.equal((await student.get("/health", { token: null })).status, 503);

    await relay.open();
    let restored = await student.refresh();
    for (let try_ = 0; try_ < 20 && restored.status === 503; try_ += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      restored = await student.refresh();
    }
    assert.equal(
      restored.status,
      200,
      "the same session refreshes, no new sign-in",
    );
    assert.equal((await student.get("/auth/me")).status, 200);
  });

  it("still ends the session for an answer about it, like a refresh token that is not valid", async () => {
    const stranger = app.browser();
    const answer = await stranger.post("/auth/refresh", {
      token: null,
      cookie: "flowforge_refresh=not-a-real-token",
    });
    assert.equal(answer.status, 401);
    assert.equal(answer.body.code, "INVALID_REFRESH_TOKEN");
  });
});

// The peak load run: Prisma's wait to start a transaction expired, and 25 requests answered 500.
describe("A database too busy to start a transaction", () => {
  let app: TestApp;

  before(async () => {
    app = await startTestApp({ env: { DB_POOL_MAX: "1" } });
    await app.reset();
  });
  after(() => app.close());

  it("answers 503 without details and keeps the session, which refreshes once a connection is free", async () => {
    const student = await app.browser().signIn(`meera.25${DOMAIN}`);
    const cookie = student.cookie("flowforge_refresh");
    assert.ok(cookie);

    // Holds the pool's only connection for longer than Prisma waits to start a transaction (2 s).
    let release = () => {};
    const released = new Promise<void>((resolve) => (release = resolve));
    let held = () => {};
    const isHeld = new Promise<void>((resolve) => (held = resolve));
    const holding = app.prisma.$transaction(
      async () => {
        held();
        await released;
      },
      { timeout: 30_000 },
    );
    await isHeld;

    const refresh = await student.refresh();
    release();
    await holding;

    assert.equal(refresh.status, 503);
    assert.equal(refresh.body.code, "SERVICE_UNAVAILABLE");
    assert.doesNotMatch(JSON.stringify(refresh.body), /transaction|prisma/i);
    assert.equal(
      student.cookie("flowforge_refresh"),
      cookie,
      "the refresh cookie is kept",
    );
    assert.equal(
      (await student.refresh()).status,
      200,
      "the same session refreshes, no new sign-in",
    );
  });
});
