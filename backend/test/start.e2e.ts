import "./support/test-env";
import { after, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { ChildProcess, spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { AddressInfo, createServer } from "node:net";
import { join } from "node:path";

const BACKEND = join(__dirname, "..");
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

/** Polls the URL until it answers, or gives up after `timeoutMs`. */
async function waitForAnswer(
  url: string,
  timeoutMs: number,
): Promise<{ status: number; body: unknown }> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(url);
      return { status: response.status, body: await response.json() };
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

/** Stops npm and the node process it started (one process group). */
function stop(child: ChildProcess | undefined): void {
  if (child?.pid && child.exitCode === null) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }
}

describe("The production build and start script", () => {
  let api: ChildProcess | undefined;
  after(() => stop(api));

  it("builds into dist/main.js, and `npm start` serves GET /api/health", async () => {
    const build = spawnSync(NPM, ["run", "build"], {
      cwd: BACKEND,
      encoding: "utf8",
      timeout: 180_000,
    });
    assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);
    assert.ok(existsSync(join(BACKEND, "dist", "main.js")), "dist/main.js");
    assert.ok(!existsSync(join(BACKEND, "dist", "src")), "no dist/src");

    const port = await freePort();
    let output = "";
    api = spawn(NPM, ["start"], {
      cwd: BACKEND,
      env: { ...process.env, PORT: String(port), API_WORKERS: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    api.stdout?.on("data", (chunk: Buffer) => (output += chunk.toString()));
    api.stderr?.on("data", (chunk: Buffer) => (output += chunk.toString()));

    const health = await waitForAnswer(
      `http://127.0.0.1:${port}/api/health`,
      60_000,
    ).catch((error: unknown) => {
      throw new Error(`no answer from npm start: ${String(error)}\n${output}`);
    });
    assert.equal(health.status, 200, output);
    assert.deepEqual(health.body, { status: "ok", database: "ok" });
  });
});
