import type { Cluster, Worker } from "node:cluster";
import * as clusterModule from "node:cluster";
import { config as loadEnvFile } from "dotenv";
import { parseEnvironment } from "./config/env.validation";

// Compiled to CommonJS without esModuleInterop, the module object is the cluster itself.
const cluster = clusterModule as unknown as Cluster;

/**
 * `npm start`: API_WORKERS processes behind one port (H4, ADR 024). One Node
 * process runs JavaScript on one core, so a single process tops out long
 * before the database does. The primary only supervises: it checks the
 * configuration (including the connection budget) before forking, replaces a
 * worker that dies, and on SIGTERM lets every worker finish its requests.
 * Rate-limit counters live in PostgreSQL, so every worker enforces the same
 * limits.
 */
const GRACE_MS = 30_000;
/** Workers that die before they ever listen, one after another: the config or the database is wrong. */
const MAX_FAILED_BOOTS = 3;

function log(message: string): void {
  console.log(`[cluster ${process.pid}] ${message}`);
}

function runPrimary(): void {
  // Same as ConfigModule: .env fills in what the environment does not set.
  loadEnvFile({ quiet: true });
  let workers: number;
  try {
    workers = parseEnvironment(process.env).apiWorkers;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const listening = new WeakSet<Worker>();
  let failedBoots = 0;
  let stopping = false;

  cluster.on("listening", (worker) => {
    listening.add(worker);
    failedBoots = 0;
    log(`worker ${worker.process.pid} listening`);
  });
  cluster.on("exit", (worker, code, signal) => {
    if (stopping) {
      if (Object.keys(cluster.workers ?? {}).length === 0) process.exit(0);
      return;
    }
    if (!listening.has(worker)) failedBoots += 1;
    if (failedBoots >= MAX_FAILED_BOOTS) {
      log(`${failedBoots} workers failed to start; giving up`);
      process.exit(1);
    }
    log(
      `worker ${worker.process.pid} exited (${signal ?? `code ${code}`}); starting a new one`,
    );
    cluster.fork();
  });

  const stop = (signal: NodeJS.Signals) => {
    if (stopping) return;
    stopping = true;
    log(`${signal}: letting the workers finish their requests`);
    for (const worker of Object.values(cluster.workers ?? {})) {
      worker?.process.kill("SIGTERM");
    }
    setTimeout(() => process.exit(1), GRACE_MS).unref();
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);

  log(`starting ${workers} workers`);
  for (let i = 0; i < workers; i += 1) cluster.fork();
}

if (cluster.isPrimary) {
  runPrimary();
} else {
  void import("./main").then(({ bootstrap }) => bootstrap());
}
