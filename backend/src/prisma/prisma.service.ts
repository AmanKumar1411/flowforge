import {
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { Transaction } from "../common/transaction";
import { Prisma, PrismaClient } from "../generated/prisma/client";

// Without a timeout, an unreachable database (e.g. a paused Docker) makes boot hang forever.
const CONNECT_TIMEOUT_MS = 5_000;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly pool: Pool;
  private readonly target: string;

  constructor(config: ConfigService) {
    const connectionString = config.getOrThrow<string>("DATABASE_URL");
    const pool = new Pool({
      connectionString,
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    });
    super({ adapter: new PrismaPg(pool) });
    this.pool = pool;
    const url = new URL(connectionString);
    this.target = `${url.hostname}:${url.port || 5432}${url.pathname}`;
  }

  /** The client to query with: the open transaction if there is one, otherwise the pool. */
  client(tx?: Transaction): Prisma.TransactionClient {
    return tx ? (tx as unknown as Prisma.TransactionClient) : this;
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      // The driver adapter connects lazily; one query proves the database answers.
      await this.$queryRaw`SELECT 1`;
    } catch (error) {
      throw new Error(
        `Cannot reach PostgreSQL at ${this.target} within ${CONNECT_TIMEOUT_MS / 1000}s. ` +
          "Is the database (Docker Desktop) running and not paused? " +
          `Cause: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
    await this.pool.end();
  }
}
