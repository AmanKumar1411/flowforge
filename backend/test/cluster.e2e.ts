import { TEST_DATABASE_URL } from "./support/test-env";
import { after, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { ChildProcess, spawn, spawnSync } from "node:child_process";
import { request } from "node:http";
import { AddressInfo, createServer } from "node:net";
import { join } from "node:path";
import { Client } from "pg";
import { DOMAIN, FRONTEND_ORIGIN } from "./support/constants";

const BACKEND = join(__dirname, "..");
const CLUSTER = [
  "--require",
  "ts-node/register/transpile-only",
  "src/cluster.ts",
];

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

/** One request on a new connection, so the cluster may hand it to any worker. */
function send(
  port: number,
  method: string,
  path: string,
  body?: object,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const outgoing = request(
      {
        host: "127.0.0.1",
        port,
        method,
        path: `/api${path}`,
        agent: false,
        headers: {
          Origin: FRONTEND_ORIGIN,
          ...(payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
              }
            : {}),
        },
      },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode ?? 0));
      },
    );
    outgoing.on("error", reject);
    outgoing.end(payload);
  });
}

class RunningCluster {
  output = "";
  readonly process: ChildProcess;

  constructor(env: Record<string, string>) {
    this.process = spawn(process.execPath, CLUSTER, {
      cwd: BACKEND,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.process.stdout?.on("data", (chunk: Buffer) => {
      this.output += chunk.toString();
    });
    this.process.stderr?.on("data", (chunk: Buffer) => {
      this.output += chunk.toString();
    });
  }

  /** The pids of workers that have listened so far. */
  listening(): number[] {
    return [...this.output.matchAll(/worker (\d+) listening/g)].map((m) =>
      Number(m[1]),
    );
  }

  async waitFor(done: () => boolean, what: string, timeoutMs = 90_000) {
    const deadline = Date.now() + timeoutMs;
    while (!done()) {
      if (Date.now() > deadline || this.process.exitCode !== null) {
        throw new Error(`${what}: not seen\n${this.output}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}

describe("The cluster entry point (H4)", () => {
  let running: RunningCluster | undefined;
  after(() => {
    if (running?.process.exitCode === null) running.process.kill("SIGKILL");
  });

  it("refuses to start when the workers' pools would exceed the database's connections", () => {
    const result = spawnSync(process.execPath, CLUSTER, {
      cwd: BACKEND,
      env: {
        ...process.env,
        API_WORKERS: "10",
        DB_POOL_MAX: "10",
        DB_MAX_CONNECTIONS: "50",
      },
      encoding: "utf8",
      timeout: 60_000,
    });
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /API_WORKERS × DB_POOL_MAX \(10 × 10 = 100\) exceeds DB_MAX_CONNECTIONS − DB_CONNECTION_HEADROOM \(50 − 10 = 40\)/,
    );
  });

  it("runs two workers that share the rate limits, replaces one that dies, and stops on SIGTERM", async () => {
    // Counters left by earlier test files in this minute would count against this one.
    const db = new Client({ connectionString: TEST_DATABASE_URL });
    await db.connect();
    await db.query('TRUNCATE "RateLimitCounter"');
    await db.end();

    const port = await freePort();
    running = new RunningCluster({
      PORT: String(port),
      API_WORKERS: "2",
      AUTH_LOGIN_RATE_LIMIT_PER_MINUTE: "3",
    });
    const cluster = running;
    await cluster.waitFor(
      () => cluster.listening().length >= 2,
      "two workers listening",
    );
    assert.equal(await send(port, "GET", "/health"), 200);

    // Five sign-ins on five connections, spread over both workers: one budget of three.
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      statuses.push(
        await send(port, "POST", "/auth/dev-login", {
          email: `rahul.25${DOMAIN}`,
          name: "Rahul",
        }),
      );
    }
    assert.deepEqual(statuses, [204, 204, 204, 429, 429]);

    const [victim] = cluster.listening();
    process.kill(victim, "SIGKILL");
    await cluster.waitFor(
      () => cluster.listening().length >= 3,
      "a replacement worker",
    );
    assert.match(cluster.output, new RegExp(`worker ${victim} exited`));
    assert.equal(await send(port, "GET", "/health"), 200);

    cluster.process.kill("SIGTERM");
    const code = await new Promise<number | null>((resolve) =>
      cluster.process.once("exit", resolve),
    );
    assert.equal(code, 0, cluster.output);
  });
});
