import { Global, Module } from "@nestjs/common";
import { RateLimiter } from "../common/rate-limit";
import { TransactionRunner } from "../common/transaction";
import { PostgresRateLimiter } from "./postgres-rate-limiter";
import { PrismaTransactionRunner } from "./prisma-transaction.runner";
import { PrismaService } from "./prisma.service";

@Global()
@Module({
  providers: [
    PrismaService,
    { provide: TransactionRunner, useClass: PrismaTransactionRunner },
    PostgresRateLimiter,
    { provide: RateLimiter, useExisting: PostgresRateLimiter },
  ],
  exports: [PrismaService, TransactionRunner, PostgresRateLimiter, RateLimiter],
})
export class PrismaModule {}
