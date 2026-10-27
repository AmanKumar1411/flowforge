import { Global, Module } from "@nestjs/common";
import { TransactionRunner } from "../common/transaction";
import { PrismaTransactionRunner } from "./prisma-transaction.runner";
import { PrismaService } from "./prisma.service";

@Global()
@Module({
  providers: [
    PrismaService,
    { provide: TransactionRunner, useClass: PrismaTransactionRunner },
  ],
  exports: [PrismaService, TransactionRunner],
})
export class PrismaModule {}
