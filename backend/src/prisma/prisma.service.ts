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

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly pool: Pool;

  constructor(config: ConfigService) {
    const pool = new Pool({
      connectionString: config.getOrThrow<string>("DATABASE_URL"),
    });
    super({ adapter: new PrismaPg(pool) });
    this.pool = pool;
  }

  /** The client to query with: the open transaction if there is one, otherwise the pool. */
  client(tx?: Transaction): Prisma.TransactionClient {
    return tx ? (tx as unknown as Prisma.TransactionClient) : this;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
    await this.pool.end();
  }
}
